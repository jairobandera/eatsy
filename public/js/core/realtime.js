/**
 * Cliente WebSocket (API nativa del navegador) con reconexión automática.
 *
 *   const rt = createRealtime();
 *   rt.on('pedido:creado', (pedido) => ...);
 *   rt.onReconnect(() => recargarDatos());   // por si se perdieron eventos
 */
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
