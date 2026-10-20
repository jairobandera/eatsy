import { api } from '../core/api.js';
import { mountLayout } from '../core/layout.js';
import { createRealtime } from '../core/realtime.js';
import { play } from '../core/sound.js';
import { confirmDialog, escapeHtml, flashNuevo, formatTime, html, showError, toast } from '../core/ui.js';

await mountLayout('cocina', { realtime: true, sound: true });
const app = document.getElementById('app');
app.classList.replace('container-xxl', 'container-fluid');
app.classList.add('px-3', 'px-lg-4');

const ORDER_KEY = 'ap_cocina_order';
let order = 'asc';
try {
  order = localStorage.getItem(ORDER_KEY) === 'desc' ? 'desc' : 'asc';
} catch {
  /* sin storage */
}

app.innerHTML = `
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <h1 class="page-title h3"><i class="bi bi-fire text-brand me-2"></i>En preparación <span class="badge rounded-pill bg-brand align-middle" id="contador">0</span></h1>
    <div class="btn-group" role="group" aria-label="Orden">
      <input type="radio" class="btn-check" name="orden" id="o-asc" value="asc" ${order === 'asc' ? 'checked' : ''}>
      <label class="btn btn-outline-secondary" for="o-asc"><i class="bi bi-sort-up me-1"></i>Más antiguos primero</label>
      <input type="radio" class="btn-check" name="orden" id="o-desc" value="desc" ${order === 'desc' ? 'checked' : ''}>
      <label class="btn btn-outline-secondary" for="o-desc"><i class="bi bi-sort-down me-1"></i>Más nuevos primero</label>
    </div>
  </div>
  <div class="row g-3" id="pedidos"></div>
  <div class="empty-state d-none" id="vacio"><i class="bi bi-emoji-smile"></i>No hay pedidos en preparación. ¡Todo al día!</div>`;

const grid = app.querySelector('#pedidos');
const pedidos = new Map();

/** Minutos desde que se creó el pedido (las fechas vienen en hora local del local). */
const minutos = (p) => Math.max(0, Math.floor((Date.now() - new Date(p.created_at.replace(' ', 'T')).getTime()) / 60000));
const urgencia = (min) => (min >= 20 ? 'late' : min >= 10 ? 'warn' : 'ok');

/** La cocina solo ve lo que se elabora; bebidas, postres, etc. los despacha la caja. */
const deCocina = (p) => p.detalles.filter((d) => d.para_cocina !== false);

const cardHtml = (p) => {
  const min = minutos(p);
  const otros = p.detalles.length - deCocina(p).length;
  return html`<div class="col-sm-6 col-lg-4 col-xxl-3" data-id="${p.id}">
    <article class="kitchen-card card-app h-100 d-flex flex-column" data-urgencia="${urgencia(min)}">
      <header class="kitchen-head">
        <div><div class="kitchen-code">${p.codigo}</div><small>${p.origen === 'Mozo' ? html`<b>Mesa ${p.mesa}</b> · ${p.usuario.nombre}` : p.origen} · ${formatTime(p.created_at)}</small></div>
        <div class="text-end"><div class="kitchen-timer" data-timer><i class="bi bi-stopwatch me-1"></i>${min} min</div></div>
      </header>
      <ul class="kitchen-items list-unstyled mb-0 flex-grow-1">
        ${deCocina(p).map(
          (d) => html`<li><span class="qty">${d.cantidad}</span><div><div class="fw-semibold">${d.producto.nombre}</div>
            ${d.extras?.length ? html`<div class="extra"><i class="bi bi-plus-circle-fill me-1"></i>EXTRA: ${d.extras.map((e) => `${e.cantidad}x ${e.nombre}`).join(', ')}</div>` : ''}
            ${d.quitados.length ? html`<div class="sin"><i class="bi bi-x-circle me-1"></i>SIN: ${d.quitados.map((q) => q.nombre).join(', ')}</div>` : ''}</div></li>`,
        )}
      </ul>
      ${otros ? html`<div class="px-3 pb-2 small text-muted"><i class="bi bi-cup-straw me-1"></i>+${otros} ${otros === 1 ? 'producto' : 'productos'} a cargo de la caja</div>` : ''}
      <footer class="p-3 pt-0"><button class="btn btn-success w-100 btn-lg rounded-pill" data-listo="${p.id}"><i class="bi bi-check2-circle me-1"></i>Listo</button></footer>
    </article></div>`.toString();
};

function sortCards() {
  const cols = [...grid.children].sort((a, b) => (order === 'asc' ? a.dataset.id - b.dataset.id : b.dataset.id - a.dataset.id));
  cols.forEach((c) => grid.appendChild(c));
}

function refreshEmpty() {
  app.querySelector('#contador').textContent = pedidos.size;
  app.querySelector('#vacio').classList.toggle('d-none', pedidos.size > 0);
}

function upsertCard(p, { nuevo = false, modificado = false } = {}) {
  pedidos.set(p.id, p);
  const existing = grid.querySelector(`[data-id="${p.id}"]`);
  if (existing) existing.outerHTML = cardHtml(p);
  else grid.insertAdjacentHTML('beforeend', cardHtml(p));
  sortCards();
  refreshEmpty();
  const card = grid.querySelector(`[data-id="${p.id}"] .kitchen-card`);
  if (nuevo) flashNuevo(card);
  if (modificado) {
    flashNuevo(card);
    card.querySelector('.badge-nuevo').textContent = 'MODIFICADO';
  }
}

function removeCard(id) {
  pedidos.delete(id);
  grid.querySelector(`[data-id="${id}"]`)?.remove();
  refreshEmpty();
}

async function load() {
  try {
    const lista = await api.get('/cocina/pedidos', { order });
    pedidos.clear();
    grid.innerHTML = lista.map(cardHtml).join('');
    lista.forEach((p) => pedidos.set(p.id, p));
    refreshEmpty();
  } catch (err) {
    grid.innerHTML = `<div class="col-12 text-danger">${escapeHtml(err.message)}</div>`;
  }
}

grid.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-listo]');
  if (!b) return;
  const p = pedidos.get(Number(b.dataset.listo));
  const text = p.origen === 'Mozo' ? `Se avisará a ${p.usuario.nombre} para que lo lleve a la mesa ${p.mesa}.` : 'Se avisará a la caja y aparecerá en la pantalla de llamados.';
  if (!(await confirmDialog({ title: `¿${p.codigo} está listo?`, text, confirmText: 'Sí, listo' }))) return;
  b.disabled = true;
  try {
    await api.patch(`/cocina/pedidos/${p.id}/listo`);
    removeCard(p.id);
    toast(`${p.codigo} listo`);
  } catch (err) {
    b.disabled = false;
    showError(err);
  }
});

app.querySelectorAll('[name=orden]').forEach((r) =>
  r.addEventListener('change', () => {
    order = r.value;
    try {
      localStorage.setItem(ORDER_KEY, order);
    } catch {
      /* sin storage */
    }
    sortCards();
  }),
);

// Actualiza los cronómetros cada 30 s.
setInterval(() => {
  for (const p of pedidos.values()) {
    const card = grid.querySelector(`[data-id="${p.id}"] .kitchen-card`);
    if (!card) continue;
    const min = minutos(p);
    card.dataset.urgencia = urgencia(min);
    card.querySelector('[data-timer]').innerHTML = `<i class="bi bi-stopwatch me-1"></i>${min} min`;
  }
}, 30_000);

const rt = createRealtime();
rt.on('pedido:estado', (p) => {
  if (p.estado === 'En Preparacion' && p.requiere_cocina) {
    if (pedidos.has(p.id)) return upsertCard(p);
    play('pedido');
    upsertCard(p, { nuevo: true });
    toast(`Nuevo pedido ${p.codigo}`, 'info', { text: deCocina(p).map((d) => `${d.cantidad}x ${d.producto.nombre}`).join(', '), timer: 6000 });
  } else removeCard(p.id);
});
rt.on('pedido:actualizado', (p) => {
  if (pedidos.has(p.id) && (p.estado !== 'En Preparacion' || !p.requiere_cocina)) return removeCard(p.id);
  if (p.estado === 'En Preparacion' && pedidos.has(p.id)) {
    play('pedido');
    upsertCard(p, { modificado: true });
    toast(`${p.codigo} fue modificado`, 'warning');
  }
});
rt.onReconnect(load);

load();
