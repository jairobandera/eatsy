import { api } from '../core/api.js';
import { createRealtime } from '../core/realtime.js';
import { play } from '../core/sound.js';
import { html, withLoading } from '../core/ui.js';

/**
 * Seguimiento del pedido en el celular del cliente.
 * - Paso 1: el cliente ingresa el código del ticket (y su cédula si el pedido tiene cliente).
 * - Paso 2: ve el estado en tiempo real; cuando está "Listo" suena, vibra y se avisa.
 * Esta página no tiene enlaces a ninguna otra sección; el servidor además bloquea cualquier otra ruta.
 */
const $ = (id) => document.getElementById(id);
const form = $('form');

const ESTADOS = {
  Recibido: { icon: 'receipt', titulo: 'Recibimos tu pedido', texto: 'En breve pasa a la cocina.' },
  'En Preparacion': { icon: 'fire', titulo: 'Estamos preparando tu pedido', texto: 'Te avisamos apenas esté listo.' },
  Listo: { icon: 'bell-fill', titulo: '¡Tu pedido está listo!', texto: 'Acercate al mostrador a retirarlo.' },
  Entregado: { icon: 'bag-check-fill', titulo: '¡Que lo disfrutes!', texto: 'Tu pedido ya fue entregado. ¡Gracias por elegirnos!' },
  Cancelado: { icon: 'x-circle-fill', titulo: 'Pedido cancelado', texto: 'Si tenés dudas, consultá en la caja.' },
};
const ORDEN = ['Recibido', 'En Preparacion', 'Listo', 'Entregado'];

let pedido = null;
let rt = null;
let pollTimer = null;
let sonidoListo = false;

// ───────────── Vistas ─────────────
function mostrarForm({ codigo = '' } = {}) {
  pedido = null;
  rt?.close();
  rt = null;
  clearInterval(pollTimer);
  document.title = 'Mi pedido · Eatsy';
  $('vista-estado').hidden = true;
  $('vista-form').hidden = false;
  form.reset();
  form.codigo.value = codigo;
  (codigo ? form.cedula : form.codigo).focus();
}

function mostrarEstado(p, { avisar = true } = {}) {
  const anterior = pedido?.estado;
  pedido = p;
  $('vista-form').hidden = true;
  $('vista-estado').hidden = false;

  const info = ESTADOS[p.estado] || ESTADOS.Recibido;
  const card = $('estado-card');
  card.dataset.estado = p.estado;
  $('codigo-actual').textContent = p.codigo;
  $('estado-icon').innerHTML = `<i class="bi bi-${info.icon}"></i>`;
  $('estado-titulo').textContent = p.cliente && p.estado === 'Listo' ? `¡${p.cliente.nombre}, tu pedido está listo!` : info.titulo;
  $('estado-texto').textContent = info.texto;

  // Pasos
  const pasos = $('pasos');
  const idx = ORDEN.indexOf(p.estado);
  pasos.classList.toggle('cancelado', p.estado === 'Cancelado');
  pasos.querySelectorAll('li').forEach((li, i) => {
    li.classList.toggle('hecho', idx >= 0 && i < idx);
    li.classList.toggle('actual', i === idx);
  });

  // Detalle
  $('items').innerHTML = p.detalles
    .map(
      (d) => html`<li><span class="qty">${d.cantidad}x</span><div>${d.nombre}
        ${d.extras?.length ? html`<div class="extra">Extra: ${d.extras.map((e) => `${e.cantidad}x ${e.nombre}`).join(', ')}</div>` : ''}
        ${d.quitados.length ? html`<div class="sin">Sin: ${d.quitados.join(', ')}</div>` : ''}</div></li>`,
    )
    .join('');

  const terminado = ['Entregado', 'Cancelado'].includes(p.estado);
  $('avisos').hidden = terminado || p.estado === 'Listo';
  if (terminado) {
    rt?.close();
    clearInterval(pollTimer);
  }

  if (p.estado === 'Listo' && anterior !== 'Listo' && avisar) avisarListo();
  if (p.estado !== 'Listo') document.title = 'Mi pedido · Eatsy';
}

// ───────────── Aviso de "pedido listo" ─────────────
function avisarListo() {
  // Mismo sonido que usa la caja/cocina para un pedido nuevo, repetido para que se escuche.
  if (!sonidoListo) {
    sonidoListo = true;
    play('pedido');
    setTimeout(() => play('pedido'), 1500);
    setTimeout(() => play('pedido'), 3000);
  }
  navigator.vibrate?.([400, 200, 400, 200, 800]);

  const card = $('estado-card');
  card.classList.remove('alerta');
  void card.offsetWidth; // reinicia la animación
  card.classList.add('alerta');

  // Título parpadeante si la pestaña está en segundo plano.
  let on = false;
  const blink = setInterval(() => {
    document.title = (on = !on) ? '🔔 ¡Tu pedido está listo!' : `${pedido.codigo} · Eatsy`;
    if (pedido?.estado !== 'Listo') clearInterval(blink);
  }, 1000);

  // Notificación del sistema (los navegadores solo la permiten en HTTPS o localhost).
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('¡Tu pedido está listo!', { body: `${pedido.codigo} · Acercate al mostrador a retirarlo.`, icon: '/img/icono.ico', tag: 'pedido-listo', renotify: true });
    } catch {
      /* algunos navegadores móviles solo permiten notificaciones desde un service worker */
    }
  }
}

/** Pide permisos y desbloquea el audio (requiere un toque del usuario). */
function activarAvisos() {
  // El audio se desbloquea solo con este mismo toque (ver core/sound.js).
  if ('Notification' in window && window.isSecureContext && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
  if ('wakeLock' in navigator && window.isSecureContext) navigator.wakeLock.request('screen').catch(() => {});
  $('btn-activar').hidden = true;
}

// ───────────── Conexión en vivo ─────────────
function conectar() {
  rt?.close();
  rt = createRealtime({
    onStatus: (s) => {
      $('conexion').innerHTML = s === 'online' ? '<i class="bi bi-broadcast me-1 text-success"></i>Actualizando en vivo' : '<i class="bi bi-wifi-off me-1"></i>Reconectando…';
    },
  });
  // Solo aceptamos datos de NUESTRO pedido (el servidor ya filtra; esto es una segunda barrera).
  const propio = (p) => p?.id === pedido?.id && Array.isArray(p.detalles);
  rt.on('pedido:estado', (p) => propio(p) && mostrarEstado(p));
  rt.on('pedido:actualizado', (p) => propio(p) && mostrarEstado(p));
  rt.onReconnect(refrescar);

  // Respaldo: si el celular suspende la conexión, consultamos cada 20 s y al volver a la pantalla.
  clearInterval(pollTimer);
  pollTimer = setInterval(refrescar, 20_000);
}

async function refrescar() {
  try {
    const p = await api.get('/seguimiento');
    if (p) mostrarEstado(p);
    else mostrarForm(); // el seguimiento venció
  } catch (err) {
    if (err.status === 404) mostrarForm();
  }
}

document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && pedido && refrescar());

// ───────────── Formulario ─────────────
form.codigo.addEventListener('input', () => {
  form.codigo.value = form.codigo.value.toUpperCase().replace(/^PED-?/, '').replace(/[^A-Z0-9]/g, '');
});
form.cedula.addEventListener('input', () => {
  form.cedula.value = form.cedula.value.replace(/\D/g, '');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('error');
  error.classList.add('d-none');
  form.cedula.classList.remove('is-invalid');
  if (!form.codigo.value.trim()) {
    form.codigo.focus();
    return;
  }
  activarAvisos(); // aprovechamos el toque del usuario para habilitar sonido/permisos

  await withLoading($('btn-ver'), async () => {
    try {
      const p = await api.post('/seguimiento', { codigo: form.codigo.value, cedula: form.cedula.value || null });
      sonidoListo = false;
      mostrarEstado(p, { avisar: false });
      conectar();
      if (p.estado === 'Listo') avisarListo();
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('d-none');
      if (err.data?.requiere_cedula) {
        form.cedula.classList.add('is-invalid');
        form.cedula.focus();
      }
    }
  });
});

$('btn-otro').addEventListener('click', async () => {
  await api.delete('/seguimiento').catch(() => {});
  mostrarForm();
});
$('btn-activar').addEventListener('click', activarAvisos);

// ───────────── Inicio ─────────────
const codigoUrl = (new URLSearchParams(location.search).get('codigo') || '').toUpperCase().replace(/^PED-?/, '');
try {
  // ¿Ya estaba siguiendo un pedido? (cookie de seguimiento)
  const p = await api.get('/seguimiento');
  if (!p) throw new Error('sin seguimiento');
  mostrarEstado(p, { avisar: false });
  conectar();
  // Tras recargar, el navegador exige un toque antes de poder sonar.
  $('btn-activar').hidden = false;
} catch {
  mostrarForm({ codigo: codigoUrl });
}
