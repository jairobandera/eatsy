/**
 * Cliente WebSocket (API nativa del navegador) con reconexión automática.
 *
 *   const rt = createRealtime();
 *   rt.on('pedido:creado', (pedido) => ...);
 *   rt.onReconnect(() => recargarDatos());   // por si se perdieron eventos
 */
// ───────────── Cambios de configuración (superadmin) ─────────────
// Cuando el superadmin guarda cambios (marca, paquete, módulos...), las pantallas NO se recargan
// solas (alguien puede estar cobrando o cargando un pedido): aparece un cartel con "Actualizar" y
// "Más tarde". Con "Más tarde" los cambios se aplican la próxima vez que se recargue (F5) o se
// cambie de pantalla. Solo las pantallas sin nadie operándolas (el monitor de llamados) se
// recargan solas.
let modoConfig = 'preguntar'; // 'preguntar' | 'automatico' | 'nunca'

/** El monitor de llamados se recarga solo (nadie trabaja en esa pantalla). */
export const recargarSolaPorConfig = () => (modoConfig = 'automatico');
/** Pantallas que ni avisan (la del superadmin, que es la que guarda). */
export const desactivarRecargaPorConfig = () => (modoConfig = 'nunca');

const BOTON = 'border:0;border-radius:2rem;padding:.35rem .9rem;font-weight:600;cursor:pointer;white-space:nowrap';

function avisoConfig() {
  document.getElementById('aviso-config')?.remove();
  const el = document.createElement('div');
  el.id = 'aviso-config';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-label', 'Hay una actualización de la configuración');
  el.style.cssText =
    'position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:3000;background:#212529;color:#fff;padding:.75rem 1rem;border-radius:1.25rem;box-shadow:0 .5rem 1.25rem rgba(0,0,0,.25);display:flex;flex-wrap:wrap;align-items:center;gap:.6rem .75rem;font:500 .95rem/1.3 system-ui,sans-serif;max-width:calc(100% - 2rem)';
  const texto = document.createElement('span');
  texto.textContent = 'Hay una actualización de la configuración del sistema.';
  const actualizar = document.createElement('button');
  actualizar.type = 'button';
  actualizar.textContent = 'Actualizar';
  actualizar.style.cssText = `${BOTON};background:var(--brand,#ff5722);color:#fff`;
  actualizar.onclick = () => location.reload();
  const despues = document.createElement('button');
  despues.type = 'button';
  despues.textContent = 'Más tarde';
  despues.title = 'Se aplica la próxima vez que recargues la página (F5)';
  despues.style.cssText = `${BOTON};background:transparent;color:#ced4da;border:1px solid #6c757d`;
  despues.onclick = () => el.remove();
  el.append(texto, actualizar, despues);
  document.body.append(el);
}

function alCambiarConfig() {
  if (modoConfig === 'nunca') return;
  if (modoConfig === 'automatico') {
    setTimeout(() => location.reload(), 1500);
    return;
  }
  avisoConfig();
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
