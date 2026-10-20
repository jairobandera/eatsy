import { api } from '../core/api.js';
import { createRealtime } from '../core/realtime.js';
import { html, money } from '../core/ui.js';

/**
 * Celular del cliente en una mesa. Llega escaneando el QR del mozo (/mesa/<token>):
 *  1) indica su número de mesa (se recuerda en este celular);
 *  2) ve el estado de los pedidos de la mesa en vivo y puede llamar al mozo.
 * Cuando la mesa queda servida y paga, los pedidos desaparecen solos.
 */
const $ = (id) => document.getElementById(id);
const token = decodeURIComponent(location.pathname.split('/')[2] || '');
const MESA_KEY = `ap_mesa_${token}`;
const ESPERA_LLAMADO = 45; // segundos entre llamados (igual que el servidor)

const ESTADOS = {
  Recibido: { icon: 'receipt', texto: 'Recibido' },
  'En Preparacion': { icon: 'fire', texto: 'En preparación' },
  Listo: { icon: 'bell-fill', texto: '¡Ya sale! El mozo te lo lleva' },
  'En Mesa': { icon: 'check2-circle', texto: 'En tu mesa · ¡Buen provecho!' },
  Entregado: { icon: 'check2-circle', texto: 'Entregado' },
};

let mesa = null;
let mozo = '';
let rt = null;
let pollTimer = null;
let estados = new Map(); // id → estado (para avisar cuando pasa a "Listo")

const leerMesa = () => {
  try {
    return Number(localStorage.getItem(MESA_KEY)) || null;
  } catch {
    return null;
  }
};
const guardarMesa = (n) => {
  try {
    if (n) localStorage.setItem(MESA_KEY, String(n));
    else localStorage.removeItem(MESA_KEY);
  } catch {
    /* sin storage */
  }
};

function mostrar(vista) {
  for (const id of ['cargando', 'vista-error', 'vista-mesa', 'vista-pedidos']) $(id).hidden = id !== vista;
}

function mostrarError(texto) {
  $('error-texto').textContent = texto;
  mostrar('vista-error');
}

// ───────────── Paso 1: número de mesa ─────────────
function pedirMesa() {
  mesa = null;
  rt?.close();
  rt = null;
  clearInterval(pollTimer);
  $('titulo').textContent = 'Mi mesa';
  mostrar('vista-mesa');
  $('form-mesa').reset();
  $('mesa').focus();
}

$('form-mesa').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = Number($('mesa').value);
  const error = $('mesa-error');
  if (!Number.isInteger(n) || n < 1 || n > 999) {
    error.textContent = 'Ingresá el número de tu mesa.';
    error.classList.remove('d-none');
    return;
  }
  error.classList.add('d-none');
  await abrirMesa(n);
});

// ───────────── Paso 2: pedidos de la mesa ─────────────
async function abrirMesa(n) {
  mesa = n;
  guardarMesa(n);
  estados = new Map();
  $('titulo').textContent = `Mesa ${n}`;
  $('mozo-nombre').textContent = mozo;
  mostrar('vista-pedidos');
  await refrescar({ avisar: false });
  conectar();
}

function renderPedidos(data) {
  const box = $('pedidos');
  if (!data.pedidos.length) {
    box.innerHTML = `<div class="seg-card text-center text-muted"><i class="bi bi-cup-hot fs-2 d-block mb-1"></i>Todavía no hay pedidos en esta mesa.<br>Llamá al mozo cuando quieras pedir.</div>`;
    $('totales').hidden = true;
    return;
  }
  box.innerHTML = data.pedidos
    .map((p) => {
      const info = ESTADOS[p.estado] || ESTADOS.Recibido;
      return html`<article class="seg-card pedido-card" data-estado="${p.estado}">
        <div class="d-flex justify-content-between align-items-center gap-2">
          <span class="estado"><i class="bi bi-${info.icon}"></i>${info.texto}</span>
          <span class="small text-muted text-nowrap">${p.codigo}</span>
        </div>
        <ul class="list-unstyled items">${p.detalles.map(
          (d) => html`<li><span class="qty">${d.cantidad}x</span><div>${d.nombre}
            ${d.extras?.length ? html`<div class="extra">Extra: ${d.extras.map((e) => `${e.cantidad}x ${e.nombre}`).join(', ')}</div>` : ''}
            ${d.quitados.length ? html`<div class="sin">Sin: ${d.quitados.join(', ')}</div>` : ''}</div></li>`,
        )}</ul>
        <div class="d-flex justify-content-between small mt-1">
          <span class="${p.pagado ? 'text-success fw-semibold' : 'text-muted'}">${p.pagado ? 'Pagado' : 'A pagar'}</span>
          <span class="fw-semibold">${money(p.total)}</span>
        </div>
      </article>`;
    })
    .join('');
  $('totales').hidden = false;
  $('total').textContent = money(data.total);
  $('pendiente').innerHTML = data.pendiente > 0 ? html`Falta pagar<br><b>${money(data.pendiente)}</b>`.toString() : '<span class="text-success fw-semibold"><i class="bi bi-check2-all me-1"></i>Todo pago</span>';
}

function avisarListo() {
  navigator.vibrate?.([300, 150, 300]);
  document.title = '🔔 ¡Tu pedido ya sale!';
  setTimeout(() => (document.title = `Mesa ${mesa} · Eatsy`), 8000);
}

async function refrescar({ avisar = true } = {}) {
  if (!mesa) return;
  try {
    const data = await api.get(`/mesa/${encodeURIComponent(token)}/${mesa}`);
    const nuevoListo = data.pedidos.some((p) => p.estado === 'Listo' && estados.get(p.id) !== 'Listo');
    estados = new Map(data.pedidos.map((p) => [p.id, p.estado]));
    renderPedidos(data);
    if (avisar && nuevoListo) avisarListo();
  } catch (err) {
    if (err.status === 404) mostrarError(err.message);
  }
}

function conectar() {
  rt?.close();
  rt = createRealtime({
    onStatus: (s) => {
      $('conexion').innerHTML = s === 'online' ? '<i class="bi bi-broadcast me-1 text-success"></i>Actualizando en vivo' : '<i class="bi bi-wifi-off me-1"></i>Reconectando…';
      // Cada vez que (re)conecta se suscribe a su mesa: el servidor solo le manda los pedidos de esta mesa.
      if (s === 'online') rt?.send({ type: 'mesa:seguir', data: { token, mesa } });
    },
  });
  const actualizar = () => refrescar();
  ['pedido:creado', 'pedido:estado', 'pedido:actualizado', 'pago:estado'].forEach((ev) => rt.on(ev, actualizar));
  rt.on('mesa:invalida', () => mostrarError('Este código QR ya no está disponible. Pedile ayuda a un mozo.'));
  rt.onReconnect(actualizar);

  // Respaldo por si el celular suspende la conexión.
  clearInterval(pollTimer);
  pollTimer = setInterval(actualizar, 30_000);
}

document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refrescar());

// ───────────── Llamar al mozo ─────────────
let cuentaRegresiva = null;
function bloquearLlamado(segundos, texto) {
  const btn = $('btn-llamar');
  const estado = $('llamar-estado');
  btn.disabled = true;
  clearInterval(cuentaRegresiva);
  let restante = segundos;
  const tick = () => {
    estado.innerHTML = html`<i class="bi bi-check-circle-fill text-success me-1"></i>${texto}`.toString();
    btn.innerHTML = `<i class="bi bi-hourglass-split me-1"></i> Podés volver a llamar en ${restante}s`;
    if (restante-- <= 0) {
      clearInterval(cuentaRegresiva);
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-bell me-1"></i> Llamar al mozo';
    }
  };
  tick();
  cuentaRegresiva = setInterval(tick, 1000);
}

$('btn-llamar').addEventListener('click', async () => {
  const btn = $('btn-llamar');
  btn.disabled = true;
  try {
    const r = await api.post(`/mesa/${encodeURIComponent(token)}/${mesa}/llamar`, {});
    navigator.vibrate?.(80);
    bloquearLlamado(ESPERA_LLAMADO, r.repetido ? `Ya avisamos a ${r.mozo}, en breve se acerca.` : `Listo, ${r.mozo} ya fue avisado.`);
  } catch (err) {
    btn.disabled = false;
    $('llamar-estado').innerHTML = html`<span class="text-danger"><i class="bi bi-exclamation-circle me-1"></i>${err.message}</span>`.toString();
  }
});

$('btn-cambiar').addEventListener('click', () => {
  guardarMesa(null);
  pedirMesa();
});

// ───────────── Inicio ─────────────
try {
  const info = await api.get(`/mesa/${encodeURIComponent(token)}`);
  mozo = info.mozo.nombre;
  $('subtitulo').textContent = `Te atiende ${mozo}`;
  const guardada = leerMesa();
  if (guardada) await abrirMesa(guardada);
  else pedirMesa();
} catch (err) {
  mostrarError(err.status === 404 ? err.message : 'No pudimos conectar con el local. Revisá tu conexión e intentá de nuevo.');
}
