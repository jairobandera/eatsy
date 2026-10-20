import { api } from '../core/api.js';
import { createRealtime } from '../core/realtime.js';
import { html, money, withLoading } from '../core/ui.js';

/**
 * Celular del cliente en una mesa. Llega escaneando el QR del mozo (/mesa/<token>):
 *  1) ingresa su número de mesa y el código que le da el mozo;
 *  2) ve el estado de los pedidos de la mesa en vivo y puede llamar al mozo.
 * El acceso (cookie) solo vale mientras la mesa esté abierta: al liberarla, deja de servir,
 * así que con el link guardado no se puede espiar ni llamar desde otro lado.
 */
const $ = (id) => document.getElementById(id);
const token = decodeURIComponent(location.pathname.split('/')[2] || '');
const ESPERA_LLAMADO = 45; // segundos entre llamados (igual que el servidor)

const ESTADOS = {
  Recibido: { icon: 'receipt', texto: 'Recibido' },
  'En Preparacion': { icon: 'fire', texto: 'En preparación' },
  Listo: { icon: 'bell-fill', texto: '¡Ya sale! El mozo te lo lleva' },
  'En Mesa': { icon: 'check2-circle', texto: 'En tu mesa · ¡Buen provecho!' },
  Entregado: { icon: 'check2-circle', texto: 'Entregado' },
};

let mozo = '';
let mesa = null;
let rt = null;
let pollTimer = null;
let estados = new Map(); // id → estado (para avisar cuando pasa a "Listo")

function mostrar(vista) {
  for (const id of ['cargando', 'vista-error', 'vista-mesa', 'vista-pedidos']) $(id).hidden = id !== vista;
}

function mostrarError(texto) {
  $('error-texto').textContent = texto;
  mostrar('vista-error');
}

// ───────────── Paso 1: mesa + código ─────────────
function pedirMesa({ aviso = '' } = {}) {
  mesa = null;
  rt?.close();
  rt = null;
  clearInterval(pollTimer);
  document.title = 'Mi mesa · Eatsy';
  $('titulo').textContent = 'Mi mesa';
  mostrar('vista-mesa');
  $('form-mesa').reset();
  const error = $('mesa-error');
  error.classList.toggle('d-none', !aviso);
  error.classList.toggle('alert-danger', false);
  error.classList.toggle('alert-info', Boolean(aviso));
  error.textContent = aviso;
  $('mesa').focus();
}

$('codigo').addEventListener('input', (e) => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4)));

$('form-mesa').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = Number($('mesa').value);
  const codigo = $('codigo').value;
  const error = $('mesa-error');
  error.classList.remove('alert-info');
  error.classList.add('alert-danger');
  const fallar = (texto) => {
    error.textContent = texto;
    error.classList.remove('d-none');
  };
  if (!Number.isInteger(n) || n < 1 || n > 999) return fallar('Ingresá el número de tu mesa.');
  if (!/^\d{4}$/.test(codigo)) return fallar('El código de la mesa tiene 4 números. Pedíselo a tu mozo.');
  error.classList.add('d-none');

  await withLoading($('btn-entrar'), async () => {
    try {
      const data = await api.post(`/mesa/${encodeURIComponent(token)}/ingresar`, { mesa: n, codigo });
      abrirMesa(data);
    } catch (err) {
      fallar(err.message);
    }
  });
});

// ───────────── Paso 2: pedidos de la mesa ─────────────
function abrirMesa(data) {
  mesa = data.mesa;
  estados = new Map(data.pedidos.map((p) => [p.id, p.estado]));
  document.title = `Mesa ${mesa} · Eatsy`;
  $('titulo').textContent = `Mesa ${mesa}`;
  $('mozo-nombre').textContent = data.mozo.nombre;
  mostrar('vista-pedidos');
  renderPedidos(data);
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

/** La mesa se liberó (los clientes se fueron): este celular ya no tiene acceso. */
function mesaCerrada(texto = 'La mesa se cerró. ¡Gracias por venir!') {
  api.delete('/mesa').catch(() => {});
  pedirMesa({ aviso: texto });
}

async function refrescar() {
  if (!mesa) return;
  try {
    const data = await api.get('/mesa');
    if (!data) return mesaCerrada();
    const nuevoListo = data.pedidos.some((p) => p.estado === 'Listo' && estados.get(p.id) !== 'Listo');
    estados = new Map(data.pedidos.map((p) => [p.id, p.estado]));
    renderPedidos(data);
    if (nuevoListo) avisarListo();
  } catch (err) {
    if (err.status === 410) mesaCerrada(err.message);
  }
}

function conectar() {
  rt?.close();
  // La cookie de la mesa identifica a este celular: el servidor solo le manda los cambios de su mesa.
  rt = createRealtime({
    onStatus: (s) => {
      $('conexion').innerHTML = s === 'online' ? '<i class="bi bi-broadcast me-1 text-success"></i>Actualizando en vivo' : '<i class="bi bi-wifi-off me-1"></i>Reconectando…';
    },
  });
  const actualizar = () => refrescar();
  ['pedido:creado', 'pedido:estado', 'pedido:actualizado', 'pago:estado'].forEach((ev) => rt.on(ev, actualizar));
  rt.on('mesa:liberada', () => mesaCerrada());
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
  btn.disabled = true;
  clearInterval(cuentaRegresiva);
  let restante = segundos;
  const tick = () => {
    $('llamar-estado').innerHTML = html`<i class="bi bi-check-circle-fill text-success me-1"></i>${texto}`.toString();
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
    const r = await api.post('/mesa/llamar', {});
    navigator.vibrate?.(80);
    bloquearLlamado(ESPERA_LLAMADO, r.repetido ? `Ya avisamos a ${r.mozo}, en breve se acerca.` : `Listo, ${r.mozo} ya fue avisado.`);
  } catch (err) {
    btn.disabled = false;
    if (err.status === 410) return mesaCerrada(err.message);
    $('llamar-estado').innerHTML = html`<span class="text-danger"><i class="bi bi-exclamation-circle me-1"></i>${err.message}</span>`.toString();
  }
});

$('btn-cambiar').addEventListener('click', async () => {
  await api.delete('/mesa').catch(() => {});
  pedirMesa();
});

// ───────────── Inicio ─────────────
try {
  const info = await api.get(`/mesa/${encodeURIComponent(token)}`);
  mozo = info.mozo.nombre;
  $('subtitulo').textContent = `Te atiende ${mozo}`;
  // ¿Este celular ya había entrado a una mesa que sigue abierta?
  const actual = await api.get('/mesa').catch((err) => (err.status === 410 ? null : Promise.reject(err)));
  if (actual) abrirMesa(actual);
  else pedirMesa();
} catch (err) {
  mostrarError(err.status === 404 ? err.message : 'No pudimos conectar con el local. Revisá tu conexión e intentá de nuevo.');
}
