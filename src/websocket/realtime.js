import { WebSocketServer } from './server.js';

/**
 * Capa de "tiempo real" de la app: decide qué evento recibe cada pantalla.
 *
 *  - Personal (Administrador, Cajero, Cocina): datos completos de pedidos.
 *  - Kiosco (rol Cliente): solo avisos de catálogo.
 *  - Pantalla pública de llamados (sin sesión): datos mínimos y enmascarados.
 *  - Celular de un cliente siguiendo su pedido: SOLO los cambios de ese pedido.
 *  - Mozo: solo los pedidos que tomó él y los llamados de sus mesas.
 *  - Celular en una mesa (entró con el QR del mozo y el código de la mesa): solo los pedidos de esa mesa.
 */
const STAFF = new Set(['Administrador', 'Cajero', 'Cocina', 'Superadmin']);

let wss = null;

/**
 * @param {{authenticate: Function, seguimiento?: Function, mesa?: Function}} opts
 *        seguimiento / mesa: id del pedido o de la mesa abierta que habilita la cookie del celular (o null).
 */
export function initRealtime(httpServer, { authenticate, seguimiento = () => null, mesa = () => null }) {
  wss = new WebSocketServer({ path: '/ws', authenticate });
  wss.attach(httpServer);

  wss.on('connection', (conn, req) => {
    conn.seguimientoId = conn.user ? null : seguimiento(req);
    conn.mesaId = conn.user ? null : mesa(req);
    conn.send({ type: 'conectado', data: { rol: conn.user?.rol ?? (conn.mesaId ? 'Mesa' : conn.seguimientoId ? 'Seguimiento' : 'Publico') } });

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
  if (!rol) return client.mesaId ? 'mesa' : client.seguimientoId ? 'seguimiento' : 'publico';
  if (STAFF.has(rol)) return 'staff';
  if (rol === 'Mozo') return 'mozo';
  return 'kiosco';
}

/**
 * Publica un evento.
 * @param {string} type  nombre del evento (ej. 'pedido:estado')
 * @param {{staff?: any, kiosco?: any, publico?: any, seguimiento?: {id:number}, mozo?: {mozo_id:number},
 *          mesa?: {mesa_abierta_id:number}}} payloads datos por audiencia.
 *        `seguimiento` solo llega al celular que sigue ese pedido (mismo id);
 *        `mozo` solo al mozo indicado y `mesa` solo a los celulares que entraron a esa mesa abierta.
 */
export function publish(type, payloads) {
  if (!wss) return;
  wss.broadcast((client) => {
    // `todos`: aviso general para cualquier pantalla (ej. cambió la configuración), sin datos sensibles.
    if (payloads.todos !== undefined) return { type, data: payloads.todos };
    const audience = audienceOf(client);
    const data = payloads[audience];
    if (data === undefined) return null;
    if (audience === 'seguimiento' && data.id !== client.seguimientoId) return null;
    if (audience === 'mozo' && data.mozo_id !== client.user.id) return null;
    if (audience === 'mesa' && data.mesa_abierta_id !== client.mesaId) return null;
    return { type, data };
  });
}

export function connectedClients() {
  return wss ? wss.clients.size : 0;
}

export function closeRealtime() {
  wss?.close();
}
