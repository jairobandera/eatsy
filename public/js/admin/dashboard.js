import { api } from '../core/api.js';
import { mountLayout } from '../core/layout.js';
import { escapeHtml, money } from '../core/ui.js';

const user = await mountLayout('admin');
const app = document.getElementById('app');

const MODULOS = [
  { href: '/admin/productos', icon: 'basket', titulo: 'Productos', texto: 'Catálogo, precios, imágenes e ingredientes.' },
  { href: '/admin/categorias', icon: 'tags', titulo: 'Categorías', texto: 'Organizá los productos del menú.' },
  { href: '/admin/ingredientes', icon: 'egg-fried', titulo: 'Ingredientes', texto: 'Ingredientes que se pueden quitar o pedir extra.' },
  { href: '/admin/promociones', icon: 'percent', titulo: 'Promociones', texto: 'Descuentos automáticos y cupones con código.' },
  { href: '/admin/reglas-puntos', icon: 'star', titulo: 'Reglas de puntos', texto: 'Programa de fidelidad para clientes.' },
  { href: '/admin/usuarios', icon: 'people', titulo: 'Usuarios', texto: 'Personal, mozos (con su QR) y kioscos.' },
  { href: '/admin/estadisticas', icon: 'bar-chart', titulo: 'Estadísticas', texto: 'Ventas, productos más vendidos y reportes.' },
];

const kpi = (label, value, icon, cls = 'text-brand') => `
  <div class="col-6 col-lg-3"><div class="card-app kpi h-100 d-flex justify-content-between align-items-start">
    <div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>
    <i class="bi bi-${icon} kpi-icon ${cls}"></i></div></div>`;

app.innerHTML = `
  <div class="mb-4">
    <h1 class="page-title h3">¡Hola, ${escapeHtml(user.nombre)}!</h1>
    <p class="text-muted mb-0">Resumen de hoy y accesos rápidos a la gestión del local.</p>
  </div>
  <div class="row g-3 mb-4" id="kpis">${kpi('Ventas de hoy', '…', 'cash-coin')}${kpi('Pedidos', '…', 'receipt')}${kpi('Ticket promedio', '…', 'graph-up')}${kpi('Cancelados', '…', 'x-circle', 'text-danger')}</div>
  <div class="row g-3">
    ${MODULOS.map(
      (m) => `<div class="col-sm-6 col-lg-4"><a class="card-app module-card p-4" href="${m.href}">
        <div class="d-flex gap-3 align-items-center">
          <span class="module-icon"><i class="bi bi-${m.icon}"></i></span>
          <div><h2 class="h6 fw-semibold mb-1">${m.titulo}</h2><p class="small text-muted mb-0">${m.texto}</p></div>
        </div></a></div>`,
    ).join('')}
  </div>`;

try {
  const { resumen: r } = await api.get('/admin/estadisticas');
  app.querySelector('#kpis').innerHTML =
    kpi('Ventas de hoy', money(r.ventas_total), 'cash-coin') +
    kpi('Pedidos', `${r.pedidos_total} <small class="fs-6 text-muted fw-normal">(${r.pedidos_kiosco} kiosco · ${r.pedidos_caja} caja · ${r.pedidos_mozo} mozo)</small>`, 'receipt') +
    kpi('Ticket promedio', money(r.ticket_promedio), 'graph-up') +
    kpi('Cancelados', r.pedidos_cancelados, 'x-circle', 'text-danger');
} catch {
  app.querySelector('#kpis').innerHTML = '';
}
