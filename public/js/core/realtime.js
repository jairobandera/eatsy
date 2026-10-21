/**
 * Cliente WebSocket (API nativa del navegador) con reconexión automática.
 *
 *   const rt = createRealtime();
 *   rt.on('pedido:creado', (pedido) => ...);
 *   rt.onReconnect(() => recargarDatos());   // por si se perdieron eventos
 */
// ───────────── Cambios de configuración (superadmin) ─────────────
// Cuando el superadmin guarda cambios (marca, paquete, módulos...), todas las pantallas se recargan
// solas para aplicarlos. Si la pantalla tiene trabajo sin guardar (ej. un pedido a medio cargar),
// en vez de recargar muestra un aviso con un botón para hacerlo cuando el usuario termine.
let trabajoEnCurso = () => false;
let recargaDesactivada = false;
let recargaEnCurso = false;

/** La pantalla indica si tiene algo sin guardar (para no recargarla de golpe). */
export const marcarTrabajoEnCurso = (fn) => (trabajoEnCurso = fn);
/** Pantallas que no se recargan (la del superadmin, que es la que guarda). */
export const desactivarRecargaPorConfig = () => (recargaDesactivada = true);

function avisoConfig(texto, { boton = false } = {}) {
  document.getElementById('aviso-config')?.remove();
  const el = document.createElement('div');
  el.id = 'aviso-config';
  el.setAttribute('role', 'status');
  el.style.cssText =
    'position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:3000;background:#212529;color:#fff;padding:.7rem 1rem;border-radius:2rem;box-shadow:0 .5rem 1.25rem rgba(0,0,0,.25);display:flex;align-items:center;gap:.75rem;font:500 .95rem/1.3 system-ui,sans-serif;max-width:calc(100% - 2rem)';
  el.textContent = texto;
  if (boton) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Recargar';
    b.style.cssText = 'border:0;border-radius:2rem;padding:.35rem .9rem;font-weight:600;background:var(--brand,#ff5722);color:#fff;cursor:pointer';
    b.onclick = () => location.reload();
    el.append(b);
  }
  document.body.append(el);
}

function alCambiarConfig() {
  if (recargaDesactivada || recargaEnCurso) return;
  if (trabajoEnCurso()) {
    avisoConfig('Se actualizó la configuración del sistema. Recargá cuando termines.', { boton: true });
    return;
  }
  recargaEnCurso = true;
  avisoConfig('Se actualizó la configuración del sistema. Recargando…');
  setTimeout(() => location.reload(), 2000);
}

export function createRealtime({ path = '/ws', onStatus } = {}) {
  const handlers = new Map();
  const reconnectHandlers = [];
  let socket = null;
  let attempts = 0;
  let pingTimer = null;
  let everConnected = false;
  let closedByUser = false;

  const setStatus = (status) => {
    onStatus?.(status);
    document.dispatchEvent(new CustomEvent('realtime:status', { detail: status }));
  };

  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${protocol}://${location.host}${path}`);
    setStatus('connecting');

    socket.addEventListener('open', () => {
      const wasReconnect = everConnected;
      everConnected = true;
      attempts = 0;
      setStatus('online');
      clearInterval(pingTimer);
      // Ping de aplicación: mantiene viva la conexión a través de proxies.
      pingTimer = setInterval(() => send({ type: 'ping' }), 25_000);
      if (wasReconnect) reconnectHandlers.forEach((fn) => fn());
    });

    socket.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'config:actualizada') alCambiarConfig();
      (handlers.get(msg.type) || []).forEach((fn) => fn(msg.data, msg));
      (handlers.get('*') || []).forEach((fn) => fn(msg.data, msg));
    });

    socket.addEventListener('close', () => {
      clearInterval(pingTimer);
      if (closedByUser) return;
      setStatus('offline');
      // Backoff exponencial con tope de 15 s.
      const delay = Math.min(15_000, 1000 * 2 ** attempts++) + Math.random() * 500;
      setTimeout(connect, delay);
    });
  }

  function send(data) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
  }

  // Al volver a la pestaña tras suspensión, forzamos reconexión si hace falta.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && socket?.readyState === WebSocket.CLOSED && !closedByUser) connect();
  });

  connect();

  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
      return this;
    },
    onReconnect(fn) {
      reconnectHandlers.push(fn);
      return this;
    },
    send,
    close() {
      closedByUser = true;
      socket?.close();
    },
  };
}
