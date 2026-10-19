import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { FrameParser, OPCODES, encodeFrame } from '../src/websocket/protocol.js';
import { WebSocketServer } from '../src/websocket/server.js';

/** Arma un frame enmascarado como lo haría un navegador. */
function clientFrame(opcode, text, fin = true) {
  const payload = Buffer.from(text);
  const mask = Buffer.from([1, 2, 3, 4]);
  const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
  const len = payload.length;
  const header = len < 126 ? Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | len]) : Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | 126, len >> 8, len & 255]);
  return Buffer.concat([header, mask, masked]);
}

test('FrameParser decodifica frames enmascarados, incluso partidos en varios chunks', () => {
  const parser = new FrameParser({ maxPayload: 1024 });
  const frame = clientFrame(OPCODES.TEXT, 'hola mundo');
  assert.deepEqual(parser.push(frame.subarray(0, 3)), []);
  const [decoded] = parser.push(frame.subarray(3));
  assert.equal(decoded.opcode, OPCODES.TEXT);
  assert.equal(decoded.payload.toString(), 'hola mundo');
});

test('FrameParser soporta largo extendido de 16 bits', () => {
  const text = 'x'.repeat(300);
  const [decoded] = new FrameParser({ maxPayload: 1024 }).push(clientFrame(OPCODES.TEXT, text));
  assert.equal(decoded.payload.toString(), text);
});

test('FrameParser rechaza frames sin máscara y mensajes demasiado grandes', () => {
  assert.throws(() => new FrameParser({ maxPayload: 1024 }).push(encodeFrame(OPCODES.TEXT, Buffer.from('hola'))), /máscara/);
  assert.throws(() => new FrameParser({ maxPayload: 10 }).push(clientFrame(OPCODES.TEXT, 'x'.repeat(50))), /grande/);
});

test('encodeFrame usa el largo correcto según el tamaño', () => {
  assert.equal(encodeFrame(OPCODES.TEXT, Buffer.alloc(10))[1], 10);
  assert.equal(encodeFrame(OPCODES.TEXT, Buffer.alloc(200))[1], 126);
  assert.equal(encodeFrame(OPCODES.TEXT, Buffer.alloc(70000))[1], 127);
});

test('el servidor hace el handshake, responde y hace broadcast a un WebSocket real', async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ authenticate: () => ({ rol: 'Cajero' }) }).attach(server);
  wss.on('connection', (conn) => conn.on('message', (m) => conn.send({ eco: m })));
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const messages = [];
  await new Promise((resolve, reject) => {
    ws.onopen = () => ws.send('ping!');
    ws.onerror = reject;
    ws.onmessage = (e) => {
      messages.push(JSON.parse(e.data));
      if (messages.length === 1) wss.broadcast((c) => ({ para: c.user.rol }));
      if (messages.length === 2) resolve();
    };
  });
  assert.deepEqual(messages, [{ eco: 'ping!' }, { para: 'Cajero' }]);

  ws.close();
  wss.close();
  await new Promise((r) => server.close(r));
});
