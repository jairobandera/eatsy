import { EventEmitter } from 'node:events';
import { CLOSE_CODES, FrameParser, OPCODES, ProtocolError, encodeClosePayload, encodeFrame } from './protocol.js';

export const READY_STATE = Object.freeze({ OPEN: 1, CLOSING: 2, CLOSED: 3 });

const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Una conexión WebSocket ya aceptada (después del handshake).
 * Eventos: 'message' (string), 'close' (code, reason), 'error' (err).
 */
export class WebSocketConnection extends EventEmitter {
  constructor(socket, { maxPayload = 64 * 1024 } = {}) {
    super();
    this.socket = socket;
    this.readyState = READY_STATE.OPEN;
    this.isAlive = true;
    this.parser = new FrameParser({ maxPayload });
    this.maxPayload = maxPayload;
    this.fragments = null;
    this.closeTimer = null;

    socket.setNoDelay(true);
    socket.setTimeout(0);
    socket.on('data', (chunk) => this.receive(chunk));
    socket.on('error', (err) => this.emit('error', err));
    socket.on('close', () => this.#finalize(CLOSE_CODES.GOING_AWAY, ''));
  }

  receive(chunk) {
    if (this.readyState === READY_STATE.CLOSED) return;
    let frames;
    try {
      frames = this.parser.push(chunk);
    } catch (err) {
      const code = err instanceof ProtocolError ? err.code : CLOSE_CODES.PROTOCOL_ERROR;
      this.close(code, err.message);
      return;
    }
    for (const frame of frames) this.#handleFrame(frame);
  }

  #handleFrame({ fin, opcode, payload }) {
    switch (opcode) {
      case OPCODES.TEXT:
      case OPCODES.BINARY:
        if (this.fragments) return this.close(CLOSE_CODES.PROTOCOL_ERROR, 'Fragmento inesperado');
        if (fin) return this.#deliver(opcode, payload);
        this.fragments = { opcode, chunks: [payload], size: payload.length };
        return;

      case OPCODES.CONTINUATION:
        if (!this.fragments) return this.close(CLOSE_CODES.PROTOCOL_ERROR, 'Continuación sin inicio');
        this.fragments.chunks.push(payload);
        this.fragments.size += payload.length;
        if (this.fragments.size > this.maxPayload) return this.close(CLOSE_CODES.MESSAGE_TOO_BIG, 'Mensaje demasiado grande');
        if (fin) {
          const { opcode: op, chunks } = this.fragments;
          this.fragments = null;
          this.#deliver(op, Buffer.concat(chunks));
        }
        return;

      case OPCODES.PING:
        this.#write(OPCODES.PONG, payload);
        return;

      case OPCODES.PONG:
        this.isAlive = true;
        return;

      case OPCODES.CLOSE: {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : CLOSE_CODES.NORMAL;
        const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : '';
        if (this.readyState === READY_STATE.OPEN) {
          this.#write(OPCODES.CLOSE, encodeClosePayload(code));
          this.readyState = READY_STATE.CLOSING;
        }
        this.socket.end();
        this.#finalize(code, reason);
        return;
      }
      default:
        this.close(CLOSE_CODES.PROTOCOL_ERROR, 'Opcode no soportado');
    }
  }

  #deliver(opcode, payload) {
    if (opcode === OPCODES.BINARY) return this.close(CLOSE_CODES.UNSUPPORTED_DATA, 'Solo se aceptan mensajes de texto');
    let text;
    try {
      text = utf8.decode(payload);
    } catch {
      return this.close(CLOSE_CODES.INVALID_PAYLOAD, 'UTF-8 inválido');
    }
    this.emit('message', text);
  }

  #write(opcode, payload) {
    if (this.socket.destroyed || !this.socket.writable) return false;
    return this.socket.write(encodeFrame(opcode, payload));
  }

  /** Envía un mensaje de texto. Los objetos se serializan a JSON. */
  send(data) {
    if (this.readyState !== READY_STATE.OPEN) return false;
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return this.#write(OPCODES.TEXT, Buffer.from(text, 'utf8'));
  }

  ping() {
    if (this.readyState === READY_STATE.OPEN) this.#write(OPCODES.PING, Buffer.alloc(0));
  }

  close(code = CLOSE_CODES.NORMAL, reason = '') {
    if (this.readyState !== READY_STATE.OPEN) return;
    this.readyState = READY_STATE.CLOSING;
    this.#write(OPCODES.CLOSE, encodeClosePayload(code, reason));
    // Si el cliente no responde el cierre, cortamos el socket.
    this.closeTimer = setTimeout(() => this.terminate(), 3000);
    this.closeTimer.unref?.();
  }

  terminate() {
    this.socket.destroy();
    this.#finalize(CLOSE_CODES.GOING_AWAY, '');
  }

  #finalize(code, reason) {
    if (this.readyState === READY_STATE.CLOSED) return;
    this.readyState = READY_STATE.CLOSED;
    clearTimeout(this.closeTimer);
    this.emit('close', code, reason);
  }
}
