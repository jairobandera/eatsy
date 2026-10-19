/* global Chart */
/** Gráficos de estadísticas (Chart.js), compartidos por la pantalla y el reporte imprimible. */

export const PALETTE = ['#ff5722', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#6b7280', '#ec4899', '#84cc16'];
const ESTADO_COLORS = { Recibido: '#6c757d', 'En Preparacion': '#ffc107', Listo: '#0dcaf0', Entregado: '#198754', Cancelado: '#dc3545' };

const instances = new Map();
const money = (v) => `$ ${Number(v).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`;

function draw(id, config) {
  instances.get(id)?.destroy();
  const canvas = document.getElementById(id);
  if (!canvas) return;
  instances.set(id, new Chart(canvas, config));
}

const empty = (arr, key) => !arr.length || arr.every((x) => !Number(x[key]));

/** Dibuja (o redibuja) todos los gráficos. `animation: false` para imprimir. */
export function renderCharts(data, { animation = true } = {}) {
  Chart.defaults.font.family = "'Poppins', system-ui, sans-serif";
  Chart.defaults.animation = animation ? {} : false;
  Chart.defaults.maintainAspectRatio = false;

  draw('chart-ventas', {
    type: 'line',
    data: {
      labels: data.ventasDiarias.map((v) => v.fecha.slice(8, 10) + '/' + v.fecha.slice(5, 7)),
      datasets: [{ label: 'Ventas ($)', data: data.ventasDiarias.map((v) => v.total), borderColor: '#ff5722', backgroundColor: 'rgba(255,87,34,.15)', fill: true, tension: 0.3, pointRadius: 3 }],
    },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.parsed.y) } } }, scales: { y: { beginAtZero: true, ticks: { callback: money } } } },
  });

  draw('chart-top', {
    type: 'bar',
    data: {
      labels: data.masVendidos.map((m) => m.nombre),
      datasets: [{ label: 'Unidades', data: data.masVendidos.map((m) => m.total_vendido), backgroundColor: PALETTE, borderRadius: 6 }],
    },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } },
  });

  draw('chart-categorias', {
    type: 'pie',
    data: {
      labels: data.ventasPorCategoria.map((c) => c.nombre),
      datasets: [{ data: data.ventasPorCategoria.map((c) => c.total_vendido), backgroundColor: PALETTE }],
    },
    options: { plugins: { legend: { position: 'right', labels: { boxWidth: 12 } } } },
  });

  draw('chart-estados', {
    type: 'doughnut',
    data: {
      labels: data.pedidosPorEstado.map((e) => e.estado),
      datasets: [{ data: data.pedidosPorEstado.map((e) => e.total), backgroundColor: data.pedidosPorEstado.map((e) => ESTADO_COLORS[e.estado] || '#adb5bd') }],
    },
    options: { cutout: '60%', plugins: { legend: { position: 'right', labels: { boxWidth: 12 } } } },
  });

  // Solo mostramos el rango de horas con actividad (o 10 a 24 si no hay datos).
  const horas = data.ingresosPorHora;
  const conDatos = horas.map((h, i) => (h.total ? i : -1)).filter((i) => i >= 0);
  const desde = conDatos.length ? Math.max(0, conDatos[0] - 1) : 10;
  const hasta = conDatos.length ? Math.min(23, conDatos.at(-1) + 1) : 23;
  const recorte = horas.slice(desde, hasta + 1);
  draw('chart-horas', {
    type: 'bar',
    data: {
      labels: recorte.map((h) => h.hora.slice(0, 5)),
      datasets: [{ label: 'Ingresos ($)', data: recorte.map((h) => h.total), backgroundColor: '#10b981', borderRadius: 4 }],
    },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.parsed.y) } } }, scales: { y: { beginAtZero: true, ticks: { callback: money } } } },
  });

  // Mensaje de "sin datos" sobre cada gráfico vacío.
  const vacios = {
    'chart-ventas': empty(data.ventasDiarias, 'total'),
    'chart-top': !data.masVendidos.length,
    'chart-categorias': !data.ventasPorCategoria.length,
    'chart-estados': !data.pedidosPorEstado.length,
    'chart-horas': empty(data.ingresosPorHora, 'total'),
  };
  for (const [id, vacio] of Object.entries(vacios)) {
    document.querySelector(`[data-empty-for="${id}"]`)?.classList.toggle('d-none', !vacio);
  }
}
