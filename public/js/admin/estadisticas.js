import { api } from '../core/api.js';
import { mountLayout } from '../core/layout.js';
import { escapeHtml, formatDate, money, showError, todayYmd } from '../core/ui.js';
import { renderCharts } from './charts.js';

await mountLayout('admin');
const app = document.getElementById('app');

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const haceDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};
const ATAJOS = {
  hoy: () => [todayYmd(), todayYmd()],
  semana: () => [haceDias(6), todayYmd()],
  mes: () => [haceDias(29), todayYmd()],
  mesActual: () => {
    const d = new Date();
    return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), todayYmd()];
  },
};

const chartCard = (id, titulo, icon, col = 'col-lg-6') => `
  <div class="${col}"><div class="card-app p-3 h-100">
    <h2 class="h6 fw-semibold mb-3"><i class="bi bi-${icon} text-brand me-1"></i>${titulo}</h2>
    <div class="chart-box"><canvas id="${id}"></canvas>
      <div class="empty-state position-absolute top-50 start-50 translate-middle d-none" data-empty-for="${id}"><i class="bi bi-bar-chart"></i>Sin datos en el período</div>
    </div></div></div>`;

app.innerHTML = `
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div>
      <h1 class="page-title h3"><i class="bi bi-bar-chart text-brand me-2"></i>Estadísticas</h1>
      <p class="text-muted mb-0 small">Las ventas consideran pagos completados; productos y categorías, pedidos entregados.</p>
    </div>
    <button class="btn btn-outline-brand rounded-pill" id="btn-pdf"><i class="bi bi-file-earmark-pdf me-1"></i>Exportar PDF</button>
  </div>

  <form class="card-app p-3 mb-4" id="filtros">
    <div class="row g-2 align-items-end">
      <div class="col-sm-6 col-lg-3"><label class="form-label small fw-medium" for="start">Desde</label><input type="date" class="form-control" id="start" required></div>
      <div class="col-sm-6 col-lg-3"><label class="form-label small fw-medium" for="end">Hasta</label><input type="date" class="form-control" id="end" required></div>
      <div class="col-lg-auto"><button class="btn btn-brand rounded-pill px-4 w-100" type="submit"><i class="bi bi-funnel me-1"></i>Aplicar</button></div>
      <div class="col-lg d-flex flex-wrap gap-1 justify-content-lg-end">
        <button type="button" class="btn btn-sm btn-light border rounded-pill" data-atajo="hoy">Hoy</button>
        <button type="button" class="btn btn-sm btn-light border rounded-pill" data-atajo="semana">Últimos 7 días</button>
        <button type="button" class="btn btn-sm btn-light border rounded-pill" data-atajo="mes">Últimos 30 días</button>
        <button type="button" class="btn btn-sm btn-light border rounded-pill" data-atajo="mesActual">Este mes</button>
      </div>
    </div>
  </form>

  <div class="row g-3 mb-4" id="kpis"></div>
  <div class="row g-3">
    ${chartCard('chart-ventas', 'Ventas diarias', 'graph-up', 'col-12')}
    ${chartCard('chart-top', 'Top 5 productos más vendidos', 'trophy')}
    ${chartCard('chart-horas', 'Ingresos por hora del día', 'clock')}
    ${chartCard('chart-categorias', 'Unidades vendidas por categoría', 'pie-chart')}
    ${chartCard('chart-estados', 'Pedidos por estado', 'circle-half')}
  </div>`;

const start = app.querySelector('#start');
const end = app.querySelector('#end');
const params = new URLSearchParams(location.search);
[start.value, end.value] = [params.get('start_date') || haceDias(6), params.get('end_date') || todayYmd()];

const kpi = (label, value, icon, sub = '') => `
  <div class="col-6 col-lg-3"><div class="card-app kpi h-100 d-flex justify-content-between align-items-start">
    <div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub ? `<div class="small text-muted">${sub}</div>` : ''}</div>
    <i class="bi bi-${icon} kpi-icon text-brand"></i></div></div>`;

async function load() {
  history.replaceState(null, '', `?start_date=${start.value}&end_date=${end.value}`);
  try {
    const data = await api.get('/admin/estadisticas', { start_date: start.value, end_date: end.value });
    const r = data.resumen;
    const metodo = (t) => r.por_metodo.find((m) => m.tipo === t)?.total || 0;
    app.querySelector('#kpis').innerHTML =
      kpi('Ventas', money(r.ventas_total), 'cash-coin', `Efectivo ${money(metodo('Efectivo'))} · Tarjeta ${money(metodo('Tarjeta'))}`) +
      kpi('Pedidos', r.pedidos_total, 'receipt', `${r.pedidos_kiosco} kiosco · ${r.pedidos_caja} caja · ${r.pedidos_mozo} mozo`) +
      kpi('Ticket promedio', money(r.ticket_promedio), 'graph-up', `${r.pagos_completados} pagos completados`) +
      kpi('Entregados / cancelados', `${r.pedidos_entregados} / ${r.pedidos_cancelados}`, 'check2-circle', `${formatDate(start.value)} → ${formatDate(end.value)}`);
    renderCharts(data);
  } catch (err) {
    app.querySelector('#kpis').innerHTML = `<div class="col-12 text-danger">${escapeHtml(err.message)}</div>`;
    showError(err);
  }
}

app.querySelector('#filtros').addEventListener('submit', (e) => {
  e.preventDefault();
  if (end.value < start.value) return showError(new Error('"Hasta" debe ser igual o posterior a "Desde".'));
  load();
});
app.querySelectorAll('[data-atajo]').forEach((b) =>
  b.addEventListener('click', () => {
    [start.value, end.value] = ATAJOS[b.dataset.atajo]();
    load();
  }),
);
app.querySelector('#btn-pdf').addEventListener('click', () => {
  window.open(`/admin/reporte?start_date=${start.value}&end_date=${end.value}`, '_blank');
});

load();
