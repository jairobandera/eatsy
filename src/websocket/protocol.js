/**
 * Implementación del protocolo WebSocket (RFC 6455) sin dependencias.
 * Codifica frames salientes y parsea frames entrantes.
 */

export const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export const OPCODES = Object.freeze({
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
});

export const CLOSE_CODES = Object.freeze({
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  INVALID_PAYLOAD: 1007,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  INTERNAL_ERROR: 1011,
});

export class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Arma un frame del servidor (los frames del servidor nunca van enmascarados). */
export function encodeFrame(opcode, payload = Buffer.alloc(0), fin = true) {
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  header[0] = (fin ? 0x80 : 0x00) | opcode;
  return Buffer.concat([header, payload]);
}

export function encodeClosePayload(code, reason = '') {
  const reasonBuf = Buffer.from(reason, 'utf8').subarray(0, 123);
  const buf = Buffer.alloc(2 + reasonBuf.length);
  buf.writeUInt16BE(code, 0);
  reasonBuf.copy(buf, 2);
  return buf;
}

/**
 * Parser incremental: se le van pasando chunks TCP y devuelve los frames completos.
 */
export class FrameParser {
  constructor({ maxPayload }) {
    this.maxPayload = maxPayload;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const frames = [];

    while (true) {
      const frame = this.#readFrame();
      if (!frame) break;
      frames.push(frame);
    }
    return frames;
  }

  #readFrame() {
    const buf = this.buffer;
    if (buf.length < 2) return null;

    const fin = (buf[0] & 0x80) !== 0;
    const rsv = buf[0] & 0x70;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let length = buf[1] & 0x7f;
    let offset = 2;

    if (rsv !== 0) throw new ProtocolError(CLOSE_CODES.PROTOCOL_ERROR, 'Bits RSV no soportados');
    if (!Object.values(OPCODES).includes(opcode)) throw new ProtocolError(CLOSE_CODES.PROTOCOL_ERROR, 'Opcode desconocido');
    // RFC 6455 §5.1: todo frame del cliente debe venir enmascarado.
    if (!masked) throw new ProtocolError(CLOSE_CODES.PROTOCOL_ERROR, 'Frame del cliente sin máscara');

    const isControl = opcode >= 0x8;
    if (isControl && (!fin || length > 125)) {
      throw new ProtocolError(CLOSE_CODES.PROTOCOL_ERROR, 'Frame de control inválido');
    }

    if (length === 126) {
      if (buf.length < offset + 2) return null;
      length = buf.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buf.length < offset + 8) return null;
      const big = buf.readBigUInt64BE(offset);
      if (big > BigInt(this.maxPayload)) throw new ProtocolError(CLOSE_CODES.MESSAGE_TOO_BIG, 'Mensaje demasiado grande');
      length = Number(big);
      offset += 8;
    }

    if (length > this.maxPayload) throw new ProtocolError(CLOSE_CODES.MESSAGE_TOO_BIG, 'Mensaje demasiado grande');
    if (buf.length < offset + 4 + length) return null;

    const mask = buf.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.from(buf.subarray(offset, offset + length));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];

    this.buffer = buf.subarray(offset + length);
    return { fin, opcode, payload };
  }
}
