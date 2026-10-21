import { api } from '../core/api.js';
import { createRealtime } from '../core/realtime.js';
import { play } from '../core/sound.js';
import { getNegocio, html, moduloActivo } from '../core/ui.js';

/**
 * Pantalla pública (monitor del local). No requiere sesión: el servidor
 * solo le envía código, estado, nombre y los últimos 4 dígitos de la cédula.
 */
const preparando = new Map();
const listos = new Map();
const $prep = document.getElementById('preparando');
const $listos = document.getElementById('listos');

// Pedidos que el personal ocultó manualmente (se olvidan al día siguiente).
const HIDDEN_KEY = 'ap_llamados_ocultos';
const hoy = () => new Date().toDateString();
function ocultos() {
  try {
    const data = JSON.parse(localStorage.getItem(HIDDEN_KEY));
    return data?.dia === hoy() ? new Set(data.ids) : new Set();
  } catch {
    return new Set();
  }
}
function ocultar(id) {
  const set = ocultos();
  set.add(id);
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify({ dia: hoy(), ids: [...set] }));
  } catch {
    /* sin storage */
  }
}

const nombreCliente = (p) => (p.cliente ? `${p.cliente.nombre} ${p.cliente.apellido.charAt(0)}.` : '');

function render() {
  const hidden = ocultos();
  $prep.innerHTML = preparando.size
    ? [...preparando.values()].map((p) => html`<div class="ticket-prep" data-id="${p.id}">${p.codigo}</div>`).join('')
    : '<p class="vacio">—</p>';

  const visibles = [...listos.values()].filter((p) => !hidden.has(p.id)).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  $listos.innerHTML = visibles.length
    ? visibles
        .map(
          (p) => html`<div class="ticket-listo" data-id="${p.id}">
            <button class="quitar" data-ocultar="${p.id}" aria-label="Ocultar">&times;</button>
            <div class="codigo">${p.codigo}</div>
            ${p.cliente ? html`<div class="cliente">${nombreCliente(p)} · CI ${p.cliente.cedula}</div>` : ''}
          </div>`,
        )
        .join('')
    : '<p class="vacio">Todavía no hay pedidos listos</p>';
}

function aplicar(p) {
  preparando.delete(p.id);
  listos.delete(p.id);
  if (p.estado === 'En Preparacion') preparando.set(p.id, p);
  if (p.estado === 'Listo') listos.set(p.id, p);
}

async function load() {
  try {
    const data = await api.get('/publico/llamados');
    preparando.clear();
    listos.clear();
    data.preparando.forEach(aplicar);
    data.listos.forEach(aplicar);
    render();
  } catch (err) {
    console.error(err);
  }
}

$listos.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ocultar]');
  if (!b) return;
  ocultar(Number(b.dataset.ocultar));
  render();
});

const rt = createRealtime({
  onStatus: (s) => {
    const el = document.getElementById('rt-status');
    el.dataset.status = s;
    el.querySelector('.label').textContent = { online: 'En vivo', offline: 'Sin conexión', connecting: 'Conectando…' }[s];
  },
});
rt.on('pedido:estado', (p) => {
  const eraListo = listos.has(p.id);
  aplicar(p);
  render();
  if (p.estado === 'Listo' && !eraListo) {
    play('llamado');
    const card = $listos.querySelector(`[data-id="${p.id}"]`);
    card?.classList.add('llamando');
    setTimeout(() => card?.classList.remove('llamando'), 8000);
  }
});
rt.on('pedido:actualizado', (p) => {
  aplicar(p);
  render();
});
rt.onReconnect(load);

// Reloj
const reloj = document.getElementById('reloj');
const tick = () => (reloj.textContent = new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }));
tick();
setInterval(tick, 10_000);

// Pista para habilitar el sonido (los navegadores lo bloquean hasta que alguien toca la pantalla)
document.addEventListener('click', () => document.getElementById('sound-hint').remove(), { once: true });

// QR para que los clientes sigan su pedido desde el celular (solo si el módulo de seguimiento está activo).
async function cargarQr() {
  const card = document.getElementById('qr-card');
  if (!moduloActivo(await getNegocio(), 'seguimiento')) {
    card.hidden = true;
    return;
  }
  try {
    const { url, svg } = await api.get('/publico/seguimiento-qr');
    document.getElementById('qr-img').innerHTML = svg; // SVG generado por el servidor
    document.getElementById('qr-url').textContent = url;
    document.getElementById('qr-card').hidden = false;
  } catch (err) {
    card.hidden = true;
    console.error('No se pudo cargar el QR', err);
  }
}
cargarQr();

// Refresco de seguridad cada 5 minutos (por ejemplo al cambiar de día).
setInterval(load, 5 * 60_000);

load();
