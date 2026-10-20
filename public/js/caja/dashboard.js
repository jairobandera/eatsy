/* global bootstrap */
import { api } from '../core/api.js';
import { mountLayout } from '../core/layout.js';
import { createRealtime } from '../core/realtime.js';
import { play } from '../core/sound.js';
import { ESTADO_LABEL, confirmDialog, debounce, escapeHtml, estadoBadge, formatTime, html, money, renderPagination, showError, toast } from '../core/ui.js';
import { CERRADOS, cambiarEstado, cambiarPago, clienteNombre, estadoEntrega, estadosPara, origenBadge, pagoSelect, verDetalle } from './shared.js';

await mountLayout('caja', { realtime: true, sound: true });
const app = document.getElementById('app');

app.innerHTML = `
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div>
      <h1 class="page-title h3"><i class="bi bi-receipt text-brand me-2"></i>Pedidos de hoy</h1>
      <p class="text-muted small mb-0">Los pedidos nuevos del kiosco y de los mozos aparecen automáticamente. Escaneá el código del ticket para buscarlo.</p>
    </div>
    <div class="d-flex flex-wrap gap-2">
      <button class="btn btn-outline-secondary rounded-pill" id="btn-mesas"><i class="bi bi-grid-3x3-gap me-1"></i>Mesas</button>
      <a href="/caja/entregados" class="btn btn-outline-secondary rounded-pill"><i class="bi bi-bag-check me-1"></i>Entregados</a>
      <a href="/llamados" target="_blank" rel="noopener" class="btn btn-outline-info rounded-pill"><i class="bi bi-display me-1"></i>Llamados</a>
      <a href="/caja/pedido" class="btn btn-brand rounded-pill px-4"><i class="bi bi-plus-lg me-1"></i>Nuevo pedido</a>
    </div>
  </div>

  <div class="row g-3 mb-3" id="contadores"></div>

  <div class="card-app p-3 mb-3">
    <div class="row g-2 align-items-center">
      <div class="col-md">
        <div class="input-group">
          <span class="input-group-text bg-white"><i class="bi bi-upc-scan"></i></span>
          <input type="search" id="search" class="form-control" placeholder="Buscar por código (PED-XXXX), cédula o nombre del cliente" autocomplete="off">
        </div>
      </div>
      <div class="col-md-auto">
        <select class="form-select" id="vista">
          <option value="activos">En curso</option>
          <option value="cancelados">Cancelados hoy</option>
        </select>
      </div>
    </div>
  </div>

  <div class="table-wrap">
    <div class="table-responsive">
      <table class="table table-app table-hover align-middle mb-0">
        <thead><tr><th>Código</th><th>Hora</th><th>Origen</th><th class="d-none d-lg-table-cell">Cliente</th><th>Total</th><th>Estado</th><th>Pago</th><th class="text-end">Acciones</th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  </div>
  <div class="mt-3" id="paginacion"></div>`;

const tbody = app.querySelector('#tbody');
const search = app.querySelector('#search');
const state = { page: 1, search: '', vista: 'activos', pedidos: new Map() };

const accionesEstado = (p) => {
  if (CERRADOS.includes(p.estado)) return '';
  const siguientes = estadosPara(p).filter((e) => e !== p.estado);
  return html`
    ${p.estado === 'Recibido' && p.requiere_cocina !== false ? html`<button class="btn btn-sm btn-warning rounded-pill" data-cocina="${p.id}" title="Enviar a cocina"><i class="bi bi-fire"></i><span class="d-none d-xl-inline ms-1">Cocina</span></button>` : ''}
    ${p.estado === 'Recibido' && p.requiere_cocina === false
      ? p.origen === 'Mozo'
        ? html`<button class="btn btn-sm btn-info rounded-pill" data-listo="${p.id}" title="Sin cocina: preparalo y avisá al mozo"><i class="bi bi-bell"></i><span class="d-none d-xl-inline ms-1">Listo</span></button>`
        : html`<button class="btn btn-sm btn-success rounded-pill" data-entregar="${p.id}" title="Sin cocina: lo entrega la caja"><i class="bi bi-bag-check"></i><span class="d-none d-xl-inline ms-1">Entregar</span></button>`
      : ''}
    ${p.estado === 'Listo'
      ? p.origen === 'Mozo'
        ? html`<button class="btn btn-sm btn-success rounded-pill" data-entregar="${p.id}" title="El mozo lo llevó a la mesa"><i class="bi bi-check2-circle"></i><span class="d-none d-xl-inline ms-1">En mesa</span></button>`
        : html`<button class="btn btn-sm btn-success rounded-pill" data-entregar="${p.id}"><i class="bi bi-bag-check"></i><span class="d-none d-xl-inline ms-1">Entregar</span></button>`
      : ''}
    <div class="dropdown d-inline-block">
      <button class="btn btn-sm btn-outline-secondary rounded-pill dropdown-toggle" data-bs-toggle="dropdown" data-bs-popper-config='{"strategy":"fixed"}' aria-expanded="false">Estado</button>
      <ul class="dropdown-menu dropdown-menu-end">
        ${siguientes.map((e) => html`<li><button class="dropdown-item ${e === 'Cancelado' ? 'text-danger' : ''}" data-estado="${e}" data-id="${p.id}">${ESTADO_LABEL[e] || e}</button></li>`)}
      </ul>
    </div>`;
};

const rowHtml = (p) =>
  html`<tr data-id="${p.id}">
    <td class="fw-semibold text-nowrap">${p.codigo}</td>
    <td class="text-muted">${formatTime(p.created_at)}</td>
    <td>${origenBadge(p)}</td>
    <td class="d-none d-lg-table-cell">${p.cliente ? clienteNombre(p.cliente) : p.origen === 'Mozo' ? html`<span class="small text-muted"><i class="bi bi-person me-1"></i>${p.usuario.nombre}</span>` : html`<span class="text-muted">—</span>`}</td>
    <td class="fw-medium text-nowrap">${money(p.total)}<div class="small text-muted">${p.metodo_pago}</div></td>
    <td>${estadoBadge(p.estado)}</td>
    <td style="min-width:130px">${pagoSelect(p)}</td>
    <td class="text-end text-nowrap">
      <button class="btn btn-sm btn-outline-primary rounded-pill" data-ver="${p.id}" title="Ver detalle"><i class="bi bi-eye"></i></button>
      ${accionesEstado(p)}
    </td>
  </tr>`.toString();

async function load({ abrirSiUnico = false } = {}) {
  try {
    const res = await api.get('/caja/pedidos', { vista: state.vista, search: state.search, page: state.page, per_page: 10 });
    state.pedidos = new Map(res.data.map((p) => [p.id, p]));
    tbody.innerHTML = res.data.length
      ? res.data.map(rowHtml).join('')
      : `<tr><td colspan="8"><div class="empty-state"><i class="bi bi-cup-hot"></i>${state.search ? 'Ningún pedido coincide con la búsqueda.' : 'No hay pedidos en curso por ahora.'}</div></td></tr>`;
    renderPagination(app.querySelector('#paginacion'), res, (pg) => {
      state.page = pg;
      load();
    });
    if (abrirSiUnico && res.data.length === 1) verDetalle(res.data[0].id, upsert);
    cargarContadores();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-danger text-center py-4">${escapeHtml(err.message)}</td></tr>`;
  }
}

/** Contadores rápidos por estado (sobre los pedidos en curso). */
async function cargarContadores() {
  const { data } = await api.get('/caja/pedidos', { vista: 'activos', per_page: 50 });
  const count = (e) => data.filter((p) => p.estado === e).length;
  const box = (label, n, cls, icon) =>
    `<div class="col-4"><div class="card-app p-3 d-flex align-items-center gap-3"><span class="badge ${cls} fs-5 rounded-3 p-2"><i class="bi bi-${icon}"></i></span><div><div class="fs-4 fw-bold lh-1">${n}</div><div class="small text-muted">${label}</div></div></div></div>`;
  app.querySelector('#contadores').innerHTML =
    box('Recibidos', count('Recibido'), 'text-bg-secondary', 'inbox') +
    box('En preparación', count('En Preparacion'), 'text-bg-warning', 'fire') +
    box('Listos para entregar', count('Listo'), 'text-bg-info', 'bell');
}

/** Actualiza (o quita) una fila con los datos nuevos de un pedido. */
function upsert(p) {
  const tr = tbody.querySelector(`tr[data-id="${p.id}"]`);
  const pertenece = state.vista === 'activos' ? !CERRADOS.includes(p.estado) : p.estado === 'Cancelado';
  if (tr && !pertenece) tr.remove();
  else if (tr) {
    tr.outerHTML = rowHtml(p);
    state.pedidos.set(p.id, p);
  }
  if (!tbody.querySelector('tr[data-id]')) load();
  else cargarContadores();
}

// ───────────── Eventos de la tabla ─────────────
tbody.addEventListener('click', async (e) => {
  const ver = e.target.closest('[data-ver]');
  const cocina = e.target.closest('[data-cocina]');
  const entregar = e.target.closest('[data-entregar]');
  const listo = e.target.closest('[data-listo]');
  const estado = e.target.closest('[data-estado]');
  if (ver) return verDetalle(Number(ver.dataset.ver), upsert);

  let pedido;
  let nuevo;
  if (cocina) [pedido, nuevo] = [state.pedidos.get(Number(cocina.dataset.cocina)), 'En Preparacion'];
  if (entregar) {
    pedido = state.pedidos.get(Number(entregar.dataset.entregar));
    nuevo = pedido && estadoEntrega(pedido);
  }
  if (estado) [pedido, nuevo] = [state.pedidos.get(Number(estado.dataset.id)), estado.dataset.estado];
  if (listo) [pedido, nuevo] = [state.pedidos.get(Number(listo.dataset.listo)), 'Listo'];
  if (!pedido) return;
  const actualizado = await cambiarEstado(pedido, nuevo);
  if (actualizado) upsert(actualizado);
});

tbody.addEventListener('change', async (e) => {
  const sel = e.target.closest('.pago-select');
  if (!sel) return;
  const pedido = state.pedidos.get(Number(sel.dataset.pago));
  const actualizado = await cambiarPago(pedido, sel.value);
  if (actualizado) upsert(actualizado);
  else sel.value = pedido.pago.estado;
});

// ───────────── Búsqueda (compatible con lector de código de barras) ─────────────
const buscar = (opts) => {
  state.search = search.value.trim();
  state.page = 1;
  load(opts);
};
search.addEventListener('input', debounce(() => buscar(), 350));
search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    buscar({ abrirSiUnico: true });
  }
});
// Si se tipea (o escanea) fuera de un campo, el foco va al buscador.
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (document.querySelector('.modal.show, .swal2-container') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) search.focus();
});
app.querySelector('#vista').addEventListener('change', (e) => {
  state.vista = e.target.value;
  state.page = 1;
  load();
});

// ───────────── Mesas de los mozos (liberar cuando los clientes se fueron) ─────────────
document.body.insertAdjacentHTML(
  'beforeend',
  `<div class="modal fade" id="modal-mesas" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title"><i class="bi bi-grid-3x3-gap me-2"></i>Mesas abiertas</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body" id="mesas-body"></div>
    </div></div>
  </div>`,
);
const modalMesasEl = document.getElementById('modal-mesas');
const modalMesas = new bootstrap.Modal(modalMesasEl);

async function cargarMesas() {
  const body = modalMesasEl.querySelector('#mesas-body');
  try {
    const mesas = await api.get('/caja/mesas');
    body.innerHTML = mesas.length
      ? html`<div class="table-responsive"><table class="table align-middle mb-0">
          <thead><tr><th>Mesa</th><th>Mozo</th><th>Pedidos</th><th>Total</th><th>Falta cobrar</th><th class="text-end"></th></tr></thead>
          <tbody>${mesas.map(
            (m) => html`<tr>
              <td class="fw-semibold">Mesa ${m.mesa}</td>
              <td>${m.mozo.nombre}</td>
              <td class="small">${m.pedidos.map((p) => html`<div>${p.codigo} ${estadoBadge(p.estado)}</div>`)}</td>
              <td>${money(m.total)}</td>
              <td>${m.pendiente > 0 ? html`<span class="text-danger fw-semibold">${money(m.pendiente)}</span>` : html`<span class="text-success"><i class="bi bi-check2-all"></i> Pago</span>`}</td>
              <td class="text-end">${m.pendiente > 0
                ? html`<span class="small text-muted">Cobrar antes de liberar</span>`
                : html`<button class="btn btn-sm btn-outline-secondary rounded-pill" data-liberar-mozo="${m.mozo.id}" data-liberar-mesa="${m.mesa}"><i class="bi bi-door-open me-1"></i>Liberar</button>`}</td>
            </tr>`,
          )}</tbody></table></div>`.toString()
      : '<div class="empty-state"><i class="bi bi-grid-3x3-gap"></i>No hay mesas abiertas.</div>';
  } catch (err) {
    body.innerHTML = `<div class="text-danger">${escapeHtml(err.message)}</div>`;
  }
}

app.querySelector('#btn-mesas').addEventListener('click', async () => {
  await cargarMesas();
  modalMesas.show();
});

modalMesasEl.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-liberar-mesa]');
  if (!b) return;
  const mesa = Number(b.dataset.liberarMesa);
  const ok = await confirmDialog({
    title: `¿Liberar la mesa ${mesa}?`,
    text: 'Los pedidos que quedan se marcan como servidos y la mesa queda libre.',
    confirmText: 'Liberar mesa',
  });
  if (!ok) return;
  try {
    await api.post('/caja/mesas/liberar', { mozo_id: Number(b.dataset.liberarMozo), mesa });
    toast(`Mesa ${mesa} liberada`);
    cargarMesas();
    load();
  } catch (err) {
    showError(err, 'No se pudo liberar la mesa');
  }
});

// ───────────── Tiempo real ─────────────
const rt = createRealtime();
rt.on('pedido:creado', (p) => {
  play('pedido');
  toast(`Nuevo pedido ${p.codigo}`, 'info', { text: `${p.origen} · ${money(p.total)}`, timer: 4000 });
  if (state.vista !== 'activos' || state.page !== 1 || state.search) return cargarContadores();
  tbody.querySelector('.empty-state')?.closest('tr').remove();
  state.pedidos.set(p.id, p);
  tbody.insertAdjacentHTML('afterbegin', rowHtml(p));
  tbody.firstElementChild.classList.add('row-new');
  cargarContadores();
});
rt.on('pedido:estado', (p) => {
  if (p.estado === 'Listo') {
    play('pedido');
    if (p.origen === 'Mozo') toast(`${p.codigo} (mesa ${p.mesa}) está listo`, 'info', { text: `Lo lleva ${p.usuario.nombre}.`, timer: 4000 });
    else toast(`${p.codigo} está listo para entregar`, 'info', { timer: 4000 });
  }
  upsert(p);
});
rt.on('pedido:actualizado', upsert);
rt.on('pago:estado', upsert);
rt.onReconnect(() => load());

load();
