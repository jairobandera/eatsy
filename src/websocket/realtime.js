import { WebSocketServer } from './server.js';

/**
 * Capa de "tiempo real" de la app: decide qué evento recibe cada pantalla.
 *
 *  - Personal (Administrador, Cajero, Cocina): datos completos de pedidos.
 *  - Kiosco (rol Cliente): solo avisos de catálogo.
 *  - Pantalla pública de llamados (sin sesión): datos mínimos y enmascarados.
 *  - Celular de un cliente siguiendo su pedido: SOLO los cambios de ese pedido.
 *  - Mozo: solo los pedidos que tomó él y los llamados de sus mesas.
 *  - Celular en una mesa (QR del mozo): solo los pedidos de esa mesa.
 */
const STAFF = new Set(['Administrador', 'Cajero', 'Cocina']);
const MAX_MESA = 999;

let wss = null;

/**
 * @param {{authenticate: Function, seguimiento?: Function, resolverMesa?: (token:string)=>Promise<number|null>}} opts
 *        resolverMesa: id del mozo dueño de un QR de mesas (o null si no es válido).
 */
export function initRealtime(httpServer, { authenticate, seguimiento = () => null, resolverMesa = async () => null }) {
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
      // El celular de una mesa se suscribe con el QR del mozo y el número de mesa.
      if (msg?.type === 'mesa:seguir' && !conn.user) suscribirMesa(conn, msg.data, resolverMesa);
    });
  });

  return wss;
}

async function suscribirMesa(conn, data, resolverMesa) {
  const mesa = Number(data?.mesa);
  if (typeof data?.token !== 'string' || data.token.length > 40 || !Number.isInteger(mesa) || mesa < 1 || mesa > MAX_MESA) return;
  const mozoId = await resolverMesa(data.token).catch(() => null);
  if (!mozoId) return conn.send({ type: 'mesa:invalida', data: {} });
  conn.mesa = { mozoId, mesa };
  conn.send({ type: 'mesa:suscripto', data: { mesa } });
}

function audienceOf(client) {
  const rol = client.user?.rol;
  if (!rol) return client.mesa ? 'mesa' : client.seguimientoId ? 'seguimiento' : 'publico';
  if (STAFF.has(rol)) return 'staff';
  if (rol === 'Mozo') return 'mozo';
  return 'kiosco';
}

/**
 * Publica un evento.
 * @param {string} type  nombre del evento (ej. 'pedido:estado')
 * @param {{staff?: any, kiosco?: any, publico?: any, seguimiento?: {id:number}, mozo?: {mozo_id:number},
 *          mesa?: {mozo_id:number, mesa:number}}} payloads datos por audiencia.
 *        `seguimiento` solo llega al celular que sigue ese pedido (mismo id);
 *        `mozo` solo al mozo indicado y `mesa` solo a los celulares de esa mesa de ese mozo.
 */
export function publish(type, payloads) {
  if (!wss) return;
  wss.broadcast((client) => {
    const audience = audienceOf(client);
    const data = payloads[audience];
    if (data === undefined) return null;
    if (audience === 'seguimiento' && data.id !== client.seguimientoId) return null;
    if (audience === 'mozo' && data.mozo_id !== client.user.id) return null;
    if (audience === 'mesa' && (data.mozo_id !== client.mesa.mozoId || data.mesa !== client.mesa.mesa)) return null;
    return { type, data };
  });
}

export function connectedClients() {
  return wss ? wss.clients.size : 0;
}

export function closeRealtime() {
  wss?.close();
}
