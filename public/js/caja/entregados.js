import { api } from '../core/api.js';
import { mountLayout } from '../core/layout.js';
import { createRealtime } from '../core/realtime.js';
import { debounce, escapeHtml, formatTime, html, money, renderPagination } from '../core/ui.js';
import { abrirComprobante, clienteNombre, origenBadge, verDetalle } from './shared.js';

await mountLayout('caja', { realtime: true });
const app = document.getElementById('app');

app.innerHTML = `
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div>
      <h1 class="page-title h3"><i class="bi bi-bag-check text-brand me-2"></i>Entregados hoy</h1>
      <p class="text-muted small mb-0" id="resumen"></p>
    </div>
    <a href="/caja" class="btn btn-outline-secondary rounded-pill"><i class="bi bi-arrow-left me-1"></i>Pedidos en curso</a>
  </div>
  <div class="card-app p-3 mb-3">
    <div class="input-group">
      <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
      <input type="search" id="search" class="form-control" placeholder="Buscar por código, cédula o nombre" autocomplete="off">
    </div>
  </div>
  <div class="table-wrap"><div class="table-responsive">
    <table class="table table-app table-hover align-middle mb-0">
      <thead><tr><th>Código</th><th>Creado</th><th>Entregado</th><th>Origen</th><th class="d-none d-md-table-cell">Cliente</th><th>Total</th><th>Pago</th><th class="text-end">Acciones</th></tr></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div></div>
  <div class="mt-3" id="paginacion"></div>`;

const tbody = app.querySelector('#tbody');
const state = { page: 1, search: '' };

async function load() {
  try {
    const res = await api.get('/caja/pedidos', { vista: 'entregados', search: state.search, page: state.page, per_page: 15 });
    tbody.innerHTML = res.data.length
      ? res.data
          .map(
            (p) => html`<tr>
              <td class="fw-semibold">${p.codigo}</td>
              <td class="text-muted">${formatTime(p.created_at)}</td>
              <td>${formatTime(p.updated_at)}</td>
              <td>${origenBadge(p)}</td>
              <td class="d-none d-md-table-cell">${p.cliente ? clienteNombre(p.cliente) : '—'}${p.puntos_generados ? html` <span class="badge text-bg-warning"><i class="bi bi-star-fill"></i> +${p.puntos_generados}</span>` : ''}</td>
              <td class="fw-medium">${money(p.total)}</td>
              <td><span class="badge ${p.pago?.estado === 'Completado' ? 'text-bg-success' : 'text-bg-warning'}">${p.pago?.estado}</span> <small class="text-muted">${p.metodo_pago}</small></td>
              <td class="text-end text-nowrap">
                <button class="btn btn-sm btn-outline-primary rounded-pill" data-ver="${p.id}"><i class="bi bi-eye"></i></button>
                <button class="btn btn-sm btn-outline-secondary rounded-pill" data-print="${p.id}"><i class="bi bi-printer"></i></button>
              </td></tr>`,
          )
          .join('')
      : '<tr><td colspan="8"><div class="empty-state"><i class="bi bi-bag"></i>Todavía no se entregaron pedidos hoy.</div></td></tr>';
    app.querySelector('#resumen').textContent = `${res.total} pedido(s) entregado(s) hoy.`;
    renderPagination(app.querySelector('#paginacion'), res, (pg) => {
      state.page = pg;
      load();
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-danger text-center">${escapeHtml(err.message)}</td></tr>`;
  }
}

tbody.addEventListener('click', (e) => {
  const ver = e.target.closest('[data-ver]');
  const print = e.target.closest('[data-print]');
  if (ver) verDetalle(Number(ver.dataset.ver), load);
  if (print) abrirComprobante(Number(print.dataset.print));
});
app.querySelector('#search').addEventListener(
  'input',
  debounce((e) => {
    state.search = e.target.value.trim();
    state.page = 1;
    load();
  }),
);

const rt = createRealtime();
rt.on('pedido:estado', (p) => p.estado === 'Entregado' && load());
rt.onReconnect(load);

load();
