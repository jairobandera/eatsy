/* global Swal */
import { api } from '../core/api.js';
import { mountLayout } from '../core/layout.js';
import { PAGO_CLASES, confirmDialog, debounce, escapeHtml, estadoBadge, formatTime, html, money, showError, toast } from '../core/ui.js';
import { atenderLlamado, iniciarAvisosMozo, leerLlamados } from './avisos.js';

/**
 * Pantalla del mozo: sus mesas abiertas con los pedidos de cada una.
 *  - Cuando la cocina termina un pedido, suena y se resalta para que lo lleve.
 *  - Marca "En mesa" al servirlo y registra el cobro (efectivo o tarjeta), por pedido o toda la mesa.
 *  - Recibe los llamados que hacen los clientes desde el QR de la mesa (sonido discreto).
 */
const user = await mountLayout('mozo', { realtime: true, sound: true });
const esAdmin = user.rol === 'Administrador';
const app = document.getElementById('app');
const MAX_MESA = 999;

app.innerHTML = `
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
    <div>
      <h1 class="page-title h3 mb-0"><i class="bi bi-grid-3x3-gap text-brand me-2"></i>${esAdmin ? 'Mesas de los mozos' : 'Mis mesas'}</h1>
      <p class="text-muted small mb-0">Abrí la mesa cuando se sienta el cliente y pasale el <b>código</b> para que siga su pedido desde el celular.</p>
    </div>
    <button class="btn btn-brand rounded-pill px-4" id="btn-nueva"><i class="bi bi-plus-lg me-1"></i>Nueva mesa</button>
  </div>
  <div id="llamados" class="mb-3"></div>
  <div class="row g-3" id="mesas"></div>
  <div class="empty-state d-none" id="vacio"><i class="bi bi-cup-hot"></i>No tenés mesas abiertas. Tocá <b>Nueva mesa</b> cuando se siente un cliente.</div>`;

const $mesas = app.querySelector('#mesas');
const $llamados = app.querySelector('#llamados');
const pedidos = new Map(); // id → pedido (para las acciones)

const resumenItems = (p) => p.detalles.map((d) => `${d.cantidad}x ${d.producto.nombre}`).join(', ');
const pagado = (p) => p.pago?.estado === 'Completado';

/** Servido y cobrado: queda en la mesa (hasta liberarla) pero atenuado. */
const terminado = (p) => ['Entregado', 'En Mesa'].includes(p.estado) && pagado(p);

const pedidoHtml = (p) => html`<li class="pedido-mesa ${p.estado === 'Listo' ? 'listo' : ''} ${terminado(p) ? 'terminado' : ''}" data-id="${p.id}">
    <div class="d-flex justify-content-between align-items-start gap-2">
      <div class="min-w-0">
        <div class="fw-semibold">${p.codigo} <span class="small text-muted fw-normal">${formatTime(p.created_at)}</span></div>
        <div class="small text-muted text-truncate-2">${resumenItems(p)}</div>
        ${p.requiere_cocina === false && !['Listo', 'En Mesa'].includes(p.estado) ? html`<div class="small text-info-emphasis"><i class="bi bi-cup-straw me-1"></i>Lo prepara la caja</div>` : ''}
      </div>
      <div class="text-end text-nowrap">
        <div class="fw-semibold">${money(p.total)}</div>
        ${estadoBadge(p.estado)}
      </div>
    </div>
    <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
      <span class="badge rounded-pill ${PAGO_CLASES[p.pago?.estado] || 'text-bg-light'}">${pagado(p) ? `Pagado · ${p.metodo_pago}` : 'Sin cobrar'}</span>
      <span class="ms-auto"></span>
      ${p.estado === 'Listo' ? html`<button class="btn btn-sm btn-success rounded-pill" data-en-mesa="${p.id}"><i class="bi bi-check2-circle me-1"></i>Llevado a la mesa</button>` : ''}
      ${!pagado(p) ? html`<button class="btn btn-sm btn-outline-success rounded-pill" data-cobrar="${p.id}"><i class="bi bi-cash-coin me-1"></i>Cobrar</button>` : ''}
      ${['Recibido', 'En Preparacion'].includes(p.estado) && !esAdmin ? html`<a class="btn btn-sm btn-outline-primary rounded-pill" href="/mozo/pedido?id=${p.id}" title="Editar"><i class="bi bi-pencil"></i></a>` : ''}
    </div>
  </li>`;

const mesaHtml = (m) => {
  const llamando = leerLlamados().has(m.mesa) && !esAdmin;
  const hayListos = m.pedidos.some((p) => p.estado === 'Listo');
  return html`<div class="col-md-6 col-xl-4" data-mesa="${m.mesa}">
    <article class="card-app mesa-card h-100 d-flex flex-column ${llamando ? 'llamando' : ''} ${hayListos ? 'con-listos' : ''}">
      <header class="mesa-head">
        <div>
          <div class="mesa-num">Mesa ${m.mesa}</div>
          ${esAdmin ? html`<div class="small opacity-75"><i class="bi bi-person me-1"></i>${m.mozo.nombre}</div>` : ''}
          <div class="mesa-codigo" title="Pasale este código al cliente para que siga la mesa desde su celular">Código <b>${m.codigo}</b></div>
        </div>
        <div class="text-end">
          ${llamando ? html`<span class="badge rounded-pill text-bg-warning"><i class="bi bi-bell-fill me-1"></i>Te llama</span>` : ''}
          <div class="small">${m.pendiente > 0 ? html`Falta cobrar <b>${money(m.pendiente)}</b>` : m.pedidos.length ? html`<i class="bi bi-check2-all me-1"></i>Todo cobrado` : ''}</div>
        </div>
      </header>
      ${m.pedidos.length
        ? html`<ul class="list-unstyled mb-0 flex-grow-1">${m.pedidos.map(pedidoHtml)}</ul>`
        : html`<div class="flex-grow-1 text-center text-muted small py-4"><i class="bi bi-cup-hot d-block fs-3 mb-1"></i>Sin pedidos todavía</div>`}
      ${esAdmin
        ? ''
        : html`<footer class="mesa-foot">
            <a class="btn btn-outline-brand rounded-pill flex-fill" href="/mozo/pedido?mesa=${m.mesa}"><i class="bi bi-plus-lg me-1"></i>Agregar pedido</a>
            ${m.pendiente > 0
              ? html`<button class="btn btn-success rounded-pill flex-fill" data-cobrar-mesa="${m.mesa}" data-total="${m.pendiente}"><i class="bi bi-cash-stack me-1"></i>Cobrar mesa</button>`
              : html`<button class="btn btn-outline-secondary rounded-pill flex-fill" data-liberar="${m.mesa}" title="Los clientes pagaron y se fueron"><i class="bi bi-door-open me-1"></i>Liberar mesa</button>`}
          </footer>`}
    </article>
  </div>`;
};

function renderLlamados() {
  const lista = [...leerLlamados().entries()].sort((a, b) => a[1] - b[1]);
  $llamados.innerHTML = lista
    .map(
      ([mesa, fecha]) => html`<div class="alert alert-warning d-flex align-items-center gap-2 py-2 mb-2 llamado-alerta" role="alert">
        <i class="bi bi-bell-fill fs-5"></i>
        <div class="flex-grow-1"><b>Mesa ${mesa}</b> te está llamando <span class="small text-muted">· ${new Date(fecha).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', hour12: false })}</span></div>
        <button class="btn btn-sm btn-warning rounded-pill" data-voy="${mesa}"><i class="bi bi-person-walking me-1"></i>Voy</button>
      </div>`,
    )
    .join('');
}

async function load() {
  try {
    const mesas = await api.get('/mozo/mesas');
    pedidos.clear();
    mesas.forEach((m) => m.pedidos.forEach((p) => pedidos.set(p.id, p)));
    // Llamados de mesas que ya no están abiertas (liberadas desde la caja, por ejemplo) se descartan.
    if (!esAdmin) {
      const abiertas = new Set(mesas.map((m) => m.mesa));
      for (const mesa of leerLlamados().keys()) if (!abiertas.has(mesa)) atenderLlamado(mesa);
      renderLlamados();
    }
    $mesas.innerHTML = mesas.map(mesaHtml).join('');
    app.querySelector('#vacio').classList.toggle('d-none', mesas.length > 0);
  } catch (err) {
    $mesas.innerHTML = `<div class="col-12 text-danger">${escapeHtml(err.message)}</div>`;
  }
}
// ───────────── Acciones ─────────────
async function pedirMetodo(titulo, total) {
  const r = await Swal.fire({
    title: titulo,
    html: `<p class="mb-0">Total: <b>${money(total)}</b></p>`,
    icon: 'question',
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: '<i class="bi bi-cash me-1"></i>Efectivo',
    denyButtonText: '<i class="bi bi-credit-card me-1"></i>Tarjeta',
    cancelButtonText: 'Volver',
    buttonsStyling: false,
    customClass: { confirmButton: 'btn btn-success mx-1', denyButton: 'btn btn-primary mx-1', cancelButton: 'btn btn-outline-secondary mx-1' },
  });
  if (r.isConfirmed) return 'Efectivo';
  if (r.isDenied) return 'Tarjeta';
  return null;
}

$mesas.addEventListener('click', async (e) => {
  const enMesa = e.target.closest('[data-en-mesa]');
  const cobrar = e.target.closest('[data-cobrar]');
  const cobrarMesa = e.target.closest('[data-cobrar-mesa]');
  const liberar = e.target.closest('[data-liberar]');
  try {
    if (liberar) return liberarMesa(Number(liberar.dataset.liberar));
    if (enMesa) {
      const p = pedidos.get(Number(enMesa.dataset.enMesa));
      enMesa.disabled = true;
      await api.patch(`/mozo/pedidos/${p.id}/en-mesa`);
      toast(`${p.codigo} servido en la mesa ${p.mesa}`);
      return load();
    }
    if (cobrar) {
      const p = pedidos.get(Number(cobrar.dataset.cobrar));
      const metodo = await pedirMetodo(`¿Cómo pagó ${p.codigo}?`, p.total);
      if (!metodo) return;
      await api.patch(`/mozo/pedidos/${p.id}/cobrar`, { metodo_pago: metodo });
      toast(`${p.codigo} cobrado (${metodo.toLowerCase()})`);
      return load();
    }
    if (cobrarMesa) {
      const mesa = Number(cobrarMesa.dataset.cobrarMesa);
      const metodo = await pedirMetodo(`¿Cómo pagó la mesa ${mesa}?`, Number(cobrarMesa.dataset.total));
      if (!metodo) return;
      const r = await api.post(`/mozo/mesas/${mesa}/cobrar`, { metodo_pago: metodo });
      toast(`Mesa ${mesa} cobrada: ${money(r.total)} (${metodo.toLowerCase()})`);
      await load();
      // Si quedó algo sin marcar como servido, la mesa sigue abierta: ofrecemos liberarla.
      if ($mesas.querySelector(`[data-mesa="${mesa}"]`)) liberarMesa(mesa, { trasCobro: true });
      return;
    }
  } catch (err) {
    if (enMesa) enMesa.disabled = false;
    showError(err);
  }
});

/** Los clientes pagaron y se fueron: lo que quedaba pasa a "En mesa" y la mesa desaparece. */
async function liberarMesa(mesa, { trasCobro = false } = {}) {
  const ok = await confirmDialog({
    title: trasCobro ? `¿Los clientes de la mesa ${mesa} ya se fueron?` : `¿Liberar la mesa ${mesa}?`,
    text: 'Los pedidos que quedan se marcan como servidos y la mesa queda libre para los próximos clientes.',
    confirmText: 'Liberar mesa',
    cancelText: trasCobro ? 'Todavía no' : 'Cancelar',
  });
  if (!ok) return;
  try {
    await api.post(`/mozo/mesas/${mesa}/liberar`, {});
    atenderLlamado(mesa);
    renderLlamados();
    toast(`Mesa ${mesa} liberada`);
    load();
  } catch (err) {
    showError(err, 'No se pudo liberar la mesa');
  }
}

$llamados.addEventListener('click', (e) => {
  const b = e.target.closest('[data-voy]');
  if (!b) return;
  atenderLlamado(Number(b.dataset.voy));
  renderLlamados();
  load();
});

app.querySelector('#btn-nueva').addEventListener('click', async () => {
  const r = await Swal.fire({
    title: '¿Qué mesa abrís?',
    input: 'number',
    inputAttributes: { min: 1, max: MAX_MESA, inputmode: 'numeric', autofocus: 'autofocus' },
    inputPlaceholder: 'Número de mesa',
    showCancelButton: true,
    confirmButtonText: 'Abrir mesa',
    cancelButtonText: 'Cancelar',
    buttonsStyling: false,
    customClass: { confirmButton: 'btn btn-brand mx-1', cancelButton: 'btn btn-outline-secondary mx-1' },
    inputValidator: (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= MAX_MESA ? null : `Ingresá un número entre 1 y ${MAX_MESA}.`),
  });
  if (!r.isConfirmed) return;
  try {
    const mesa = await api.post('/mozo/mesas', { mesa: Number(r.value) });
    await load();
    Swal.fire({
      title: `Mesa ${mesa.numero} abierta`,
      html: `<p class="mb-1">Código para el celular del cliente:</p><div class="display-4 fw-bold text-brand">${escapeHtml(mesa.codigo)}</div>`,
      icon: 'success',
      confirmButtonText: 'Listo',
      buttonsStyling: false,
      customClass: { confirmButton: 'btn btn-brand' },
    });
  } catch (err) {
    showError(err, 'No se pudo abrir la mesa');
  }
});

// ───────────── Tiempo real ─────────────
const recargar = debounce(load, 250);
iniciarAvisosMozo({
  estadoAnterior: (id) => pedidos.get(id)?.estado,
  onCambio: recargar,
  onLlamado: () => {
    renderLlamados();
    recargar();
  },
});

renderLlamados();
load();
