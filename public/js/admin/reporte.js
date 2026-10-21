import { api } from '../core/api.js';
import { escapeHtml, formatDate, html, money, nombreNegocio, todayYmd } from '../core/ui.js';
import { renderCharts } from './charts.js';

const params = new URLSearchParams(location.search);
const start = params.get('start_date') || todayYmd();
const end = params.get('end_date') || start;
const report = document.getElementById('report');

const tabla = (cols, rows) =>
  rows.length
    ? html`<table class="table table-sm table-bordered mb-0"><thead><tr>${cols.map((c) => html`<th>${c}</th>`)}</tr></thead>
        <tbody>${rows.map((r) => html`<tr>${r.map((c) => html`<td>${c}</td>`)}</tr>`)}</tbody></table>`
    : html`<p class="text-muted fst-italic mb-0">Sin datos en el período.</p>`;

try {
  const data = await api.get('/admin/estadisticas', { start_date: start, end_date: end });
  const r = data.resumen;
  const diasConVentas = data.ventasDiarias.filter((v) => v.total > 0);

  report.innerHTML = html`
    <header>
      <div><h1 class="h4 fw-bold mb-0">Reporte de estadísticas</h1>
        <div class="text-muted">Período: ${formatDate(start)} al ${formatDate(end)}</div></div>
      <img src="/negocio/logo" alt="${nombreNegocio()}">
    </header>

    <section class="kpis">
      <div>Ventas<b>${money(r.ventas_total)}</b></div>
      <div>Pedidos<b>${r.pedidos_total}</b></div>
      <div>Ticket promedio<b>${money(r.ticket_promedio)}</b></div>
      <div>Entregados / Cancelados<b>${r.pedidos_entregados} / ${r.pedidos_cancelados}</b></div>
    </section>

    <section class="avoid-break"><h2>Ventas diarias</h2><div class="chart-box"><canvas id="chart-ventas"></canvas></div></section>

    <section class="grid-2 avoid-break">
      <div><h2>Top 5 productos</h2>${tabla(['Producto', 'Unidades', 'Importe'], data.masVendidos.map((m) => [m.nombre, m.total_vendido, money(m.importe)]))}</div>
      <div><h2>Pedidos por estado</h2>${tabla(['Estado', 'Cantidad'], data.pedidosPorEstado.map((e) => [e.estado, e.total]))}</div>
    </section>

    <section class="grid-2 avoid-break">
      <div><h2>Ventas por categoría</h2><div class="chart-box"><canvas id="chart-categorias"></canvas></div></div>
      <div><h2>Ingresos por hora</h2><div class="chart-box"><canvas id="chart-horas"></canvas></div></div>
    </section>

    <section class="avoid-break"><h2>Detalle de ventas por día</h2>
      ${tabla(['Fecha', 'Total'], diasConVentas.map((v) => [formatDate(v.fecha), money(v.total)]))}
    </section>

    <section class="avoid-break"><h2>Medios de pago</h2>
      ${tabla(['Método', 'Pagos', 'Total'], r.por_metodo.map((m) => [m.tipo, m.cantidad, money(m.total)]))}
    </section>

    <footer>Generado el ${new Date().toLocaleString('es-UY')} · ${nombreNegocio()}</footer>`;

  renderCharts(data, { animation: false });
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  setTimeout(() => window.print(), 600);
} catch (err) {
  report.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
}
