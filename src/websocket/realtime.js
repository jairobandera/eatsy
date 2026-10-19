import { WebSocketServer } from './server.js';

/**
 * Capa de "tiempo real" de la app: decide qué evento recibe cada pantalla.
 *
 *  - Personal (Administrador, Cajero, Cocina): datos completos de pedidos.
 *  - Kiosco (rol Cliente): solo avisos de catálogo.
 *  - Pantalla pública de llamados (sin sesión): datos mínimos y enmascarados.
 *  - Celular de un cliente siguiendo su pedido: SOLO los cambios de ese pedido.
 */
const STAFF = new Set(['Administrador', 'Cajero', 'Cocina']);

let wss = null;

export function initRealtime(httpServer, { authenticate, seguimiento = () => null }) {
  wss = new WebSocketServer({ path: '/ws', authenticate });
  wss.attach(httpServer);

  wss.on('connection', (conn, req) => {
    conn.seguimientoId = conn.user ? null : seguimiento(req);
    conn.send({ type: 'conectado', data: { rol: conn.user?.rol ?? (conn.seguimientoId ? 'Seguimiento' : 'Publico') } });

    conn.on('message', (text) => {
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (msg?.type === 'ping') conn.send({ type: 'pong', data: { t: Date.now() } });
    });
  });

  return wss;
}

function audienceOf(client) {
  const rol = client.user?.rol;
  if (!rol) return client.seguimientoId ? 'seguimiento' : 'publico';
  if (STAFF.has(rol)) return 'staff';
  return 'kiosco';
}

/**
 * Publica un evento.
 * @param {string} type  nombre del evento (ej. 'pedido:estado')
 * @param {{staff?: any, kiosco?: any, publico?: any, seguimiento?: {id:number}}} payloads datos por audiencia.
 *        `seguimiento` solo llega al celular que sigue ese pedido (mismo id).
 */
export function publish(type, payloads) {
  if (!wss) return;
  wss.broadcast((client) => {
    const audience = audienceOf(client);
    const data = payloads[audience];
    if (data === undefined) return null;
    if (audience === 'seguimiento' && data.id !== client.seguimientoId) return null;
    return { type, data };
  });
}

export function connectedClients() {
  return wss ? wss.clients.size : 0;
}

export function closeRealtime() {
  wss?.close();
}
