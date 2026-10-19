/* global bootstrap, Swal */
import { api } from '../core/api.js';
import { ESTADO_LABEL, PAGO_CLASES, estadoBadge, escapeHtml, formatDateTime, html, money, showError, toast } from '../core/ui.js';

export const ESTADOS = ['Recibido', 'En Preparacion', 'Listo', 'Entregado', 'Cancelado'];
export const CERRADOS = ['Entregado', 'Cancelado'];

export const clienteNombre = (c) => (c ? `${c.nombre} ${c.apellido}` : '');

export const origenBadge = (p) =>
  p.origen === 'Kiosco'
    ? html`<span class="badge rounded-pill text-bg-light border"><i class="bi bi-tablet me-1"></i>Kiosco</span>`
    : html`<span class="badge rounded-pill text-bg-light border"><i class="bi bi-person-badge me-1"></i>Caja</span>`;

export const lineaQuitados = (d) => (d.quitados.length ? html`<div class="small text-danger">Sin: ${d.quitados.map((q) => q.nombre).join(', ')}</div>` : '');
export const lineaExtras = (d) =>
  d.extras?.length ? html`<div class="small text-success">Extra: ${d.extras.map((e) => `${e.cantidad}x ${e.nombre} (+${money(e.precio)})`).join(', ')}</div>` : '';

/** Abre el comprobante imprimible en otra pestaña. */
export const abrirComprobante = (id) => window.open(`/caja/comprobante?id=${id}`, '_blank', 'noopener');

/**
 * Cambia el estado del pedido pidiendo confirmación.
 * Si se entrega con el pago pendiente, ofrece marcarlo como completado.
 * @returns {Promise<object|null>} pedido actualizado o null si se canceló
 */
export async function cambiarEstado(pedido, estado) {
  const pagoPendiente = estado === 'Entregado' && pedido.pago && pedido.pago.estado !== 'Completado';
  const label = ESTADO_LABEL[estado] || estado;

  const result = await Swal.fire({
    title: `¿Marcar ${pedido.codigo} como "${label}"?`,
    icon: estado === 'Cancelado' ? 'warning' : 'question',
    html: pagoPendiente
      ? `<p class="mb-2">El pago figura como <b>${escapeHtml(pedido.pago.estado)}</b> (${money(pedido.total)} en ${escapeHtml(pedido.pago.tipo)}).</p>`
      : estado === 'Cancelado'
        ? 'El pedido dejará de mostrarse en la lista de activos.'
        : '',
    input: pagoPendiente ? 'checkbox' : undefined,
    inputValue: 1,
    inputPlaceholder: 'Marcar el pago como completado',
    showCancelButton: true,
    confirmButtonText: estado === 'Cancelado' ? 'Sí, cancelar pedido' : 'Confirmar',
    cancelButtonText: 'Volver',
    reverseButtons: true,
    buttonsStyling: false,
    customClass: { confirmButton: `btn ${estado === 'Cancelado' ? 'btn-danger' : 'btn-brand'} mx-1`, cancelButton: 'btn btn-outline-secondary mx-1' },
  });
  if (!result.isConfirmed) return null;

  try {
    const actualizado = await api.patch(`/caja/pedidos/${pedido.id}/estado`, { estado, completar_pago: pagoPendiente && result.value === 1 });
    toast(`${pedido.codigo}: ${label}`);
    return actualizado;
  } catch (err) {
    showError(err, 'No se pudo cambiar el estado');
    return null;
  }
}

export async function cambiarPago(pedido, estado) {
  try {
    const actualizado = await api.patch(`/caja/pedidos/${pedido.id}/pago`, { estado });
    toast(`Pago ${estado.toLowerCase()}`);
    return actualizado;
  } catch (err) {
    showError(err, 'No se pudo actualizar el pago');
    return null;
  }
}

export const pagoSelect = (p) =>
  p.pago
    ? html`<select class="form-select form-select-sm rounded-pill pago-select ${PAGO_CLASES[p.pago.estado]}" data-pago="${p.id}" aria-label="Estado del pago">
        ${['Pendiente', 'Completado', 'Fallido'].map((e) => html`<option value="${e}" ${p.pago.estado === e ? 'selected' : ''}>${e}</option>`)}
      </select>`
    : '–';

// ───────────── Modal de detalle ─────────────
let modal;
let modalEl;
let onChange = () => {};

function ensureModal() {
  if (modal) return;
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="modal fade" id="modal-detalle" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title" id="det-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body" id="det-body"></div>
        <div class="modal-footer flex-wrap" id="det-footer"></div>
      </div></div></div>`,
  );
  modalEl = document.getElementById('modal-detalle');
  modal = new bootstrap.Modal(modalEl);
}

/**
 * Muestra el detalle de un pedido.
 * @param {number} id
 * @param {(pedido)=>void} [changed] callback cuando el pedido cambia desde el modal
 */
export async function verDetalle(id, changed) {
  ensureModal();
  onChange = changed || (() => {});
  let p;
  try {
    p = await api.get(`/caja/pedidos/${id}`);
  } catch (err) {
    return showError(err);
  }
  renderDetalle(p);
  modal.show();
}

function renderDetalle(p) {
  modalEl.querySelector('#det-title').innerHTML = html`Pedido <span class="text-brand">${p.codigo}</span> ${estadoBadge(p.estado)}`.toString();
  const descuentoTotal = p.detalles.reduce((s, d) => s + d.descuento, 0);

  modalEl.querySelector('#det-body').innerHTML = html`
    <div class="row g-3 mb-3 small">
      <div class="col-sm-6"><div class="text-muted">Creado</div><div class="fw-medium">${formatDateTime(p.created_at)} · ${origenBadge(p)} ${p.usuario.nombre}</div></div>
      <div class="col-sm-6"><div class="text-muted">Cliente</div><div class="fw-medium">${p.cliente ? `${clienteNombre(p.cliente)} · CI ${p.cliente.cedula}` : 'Sin cliente asociado'}</div></div>
      <div class="col-sm-6"><div class="text-muted">Pago</div><div class="fw-medium">${p.metodo_pago} · <span class="badge ${PAGO_CLASES[p.pago?.estado] || ''}">${p.pago?.estado || '-'}</span></div></div>
      ${p.puntos_generados ? html`<div class="col-sm-6"><div class="text-muted">Puntos generados</div><div class="fw-medium"><i class="bi bi-star-fill text-warning"></i> ${p.puntos_generados}</div></div>` : ''}
    </div>
    <div class="table-responsive"><table class="table table-sm align-middle">
      <thead class="table-light"><tr><th>Producto</th><th class="text-center">Cant.</th><th class="text-end">Precio</th><th class="text-end">Subtotal</th></tr></thead>
      <tbody>${p.detalles.map(
        (d) => html`<tr><td><div class="fw-medium">${d.producto.nombre}</div>${lineaExtras(d)}${lineaQuitados(d)}</td>
          <td class="text-center">${d.cantidad}</td>
          <td class="text-end">${money(d.precio_unitario)}${d.descuento ? html`<div class="small text-success">-${money(d.descuento / d.cantidad)} promo</div>` : ''}</td>
          <td class="text-end fw-medium">${money(d.subtotal)}</td></tr>`,
      )}</tbody>
      <tfoot>
        ${descuentoTotal ? html`<tr><td colspan="3" class="text-end text-success">Promociones (ya descontadas)</td><td class="text-end text-success">-${money(descuentoTotal)}</td></tr>` : ''}
        ${p.cupon ? html`<tr><td colspan="3" class="text-end text-success"><i class="bi bi-ticket-perforated me-1"></i>Cupón ${p.cupon.codigo}</td><td class="text-end text-success">-${money(p.cupon.descuento)}</td></tr>` : ''}
        <tr><td colspan="3" class="text-end fw-semibold">Total</td><td class="text-end fs-5 fw-bold">${money(p.total)}</td></tr>
      </tfoot>
    </table></div>`.toString();

  const cerrado = CERRADOS.includes(p.estado);
  const footer = modalEl.querySelector('#det-footer');
  footer.innerHTML = html`
    <button class="btn btn-outline-secondary rounded-pill me-auto" data-act="print"><i class="bi bi-printer me-1"></i>Comprobante</button>
    ${!cerrado ? html`<a class="btn btn-outline-primary rounded-pill" href="/caja/pedido?id=${p.id}"><i class="bi bi-pencil me-1"></i>Editar</a>` : ''}
    ${p.estado === 'Recibido' ? html`<button class="btn btn-warning rounded-pill" data-act="En Preparacion"><i class="bi bi-fire me-1"></i>Enviar a cocina</button>` : ''}
    ${!cerrado ? html`<button class="btn btn-success rounded-pill" data-act="Entregado"><i class="bi bi-bag-check me-1"></i>Entregar</button>` : ''}
    <button class="btn btn-light rounded-pill" data-bs-dismiss="modal">Cerrar</button>`.toString();

  footer.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'print') return abrirComprobante(p.id);
    modal.hide();
    const actualizado = await cambiarEstado(p, btn.dataset.act);
    if (actualizado) onChange(actualizado);
  };
}
