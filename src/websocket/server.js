import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { STATUS_CODES } from 'node:http';
import { WebSocketConnection } from './connection.js';
import { GUID } from './protocol.js';

/**
 * Servidor WebSocket nativo que se "engancha" al evento `upgrade` del servidor HTTP.
 *
 *   const wss = new WebSocketServer({ path: '/ws', authenticate: (req) => user | null });
 *   wss.attach(httpServer);
 *   wss.on('connection', (conn) => { ... });
 */
export class WebSocketServer extends EventEmitter {
  constructor({ path = '/ws', maxPayload = 64 * 1024, heartbeatMs = 30_000, authenticate = () => null } = {}) {
    super();
    this.path = path;
    this.maxPayload = maxPayload;
    this.authenticate = authenticate;
    this.clients = new Set();

    // Heartbeat: detecta conexiones muertas (wifi caído, pestaña congelada, etc.)
    this.heartbeat = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, heartbeatMs);
    this.heartbeat.unref?.();
  }

  attach(httpServer) {
    httpServer.on('upgrade', (req, socket, head) => this.#handleUpgrade(req, socket, head));
    return this;
  }

  #reject(socket, status) {
    socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  #handleUpgrade(req, socket, head) {
    socket.on('error', () => socket.destroy());

    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname !== this.path) return this.#reject(socket, 404);

    const key = req.headers['sec-websocket-key'];
    const isUpgrade =
      req.method === 'GET' &&
      String(req.headers.upgrade).toLowerCase() === 'websocket' &&
      String(req.headers.connection).toLowerCase().includes('upgrade');

    if (!isUpgrade || !key || Buffer.from(key, 'base64').length !== 16) return this.#reject(socket, 400);
    if (req.headers['sec-websocket-version'] !== '13') return this.#reject(socket, 426);

    // Protección contra Cross-Site WebSocket Hijacking: el Origin debe ser el mismo host.
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return this.#reject(socket, 403);
      } catch {
        return this.#reject(socket, 403);
      }
    }

    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '\r\n',
      ].join('\r\n'),
    );

    const conn = new WebSocketConnection(socket, { maxPayload: this.maxPayload });
    conn.user = this.authenticate(req);
    conn.id = crypto.randomUUID();

    this.clients.add(conn);
    conn.on('close', () => this.clients.delete(conn));
    conn.on('error', () => conn.terminate());

    if (head?.length) conn.receive(head);
    this.emit('connection', conn, req);
  }

  /**
   * Envía a cada cliente lo que devuelva `build(client)`.
   * Si `build` devuelve null/undefined, ese cliente no recibe nada.
   */
  broadcast(build) {
    for (const client of this.clients) {
      const message = typeof build === 'function' ? build(client) : build;
      if (message != null) client.send(message);
    }
  }

  close() {
    clearInterval(this.heartbeat);
    for (const client of this.clients) client.close(1001, 'Servidor apagándose');
  }
}
