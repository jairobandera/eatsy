import assert from 'node:assert/strict';
import { test } from 'node:test';
import { descuentoUnitario } from '../src/services/pricing.service.js';
import { hashPassword, verifyPassword } from '../src/utils/password.js';
import { createToken, verifyToken } from '../src/utils/token.js';
import { validate } from '../src/utils/validator.js';

test('descuentos: porcentaje, monto fijo y nunca precio negativo', () => {
  assert.equal(descuentoUnitario(900, { tipo_descuento: 'porcentaje', descuento: 50 }), 450);
  assert.equal(descuentoUnitario(700, { tipo_descuento: 'monto', descuento: 100 }), 100);
  assert.equal(descuentoUnitario(200, { tipo_descuento: 'monto', descuento: 300 }), 200);
  assert.equal(descuentoUnitario(200, null), 0);
});

test('contraseñas con scrypt', () => {
  const hash = hashPassword('123456789');
  assert.ok(hash.startsWith('scrypt$'));
  assert.ok(verifyPassword('123456789', hash));
  assert.ok(!verifyPassword('otra', hash));
});

test('tokens firmados: válidos, adulterados y vencidos', () => {
  const token = createToken({ id: 1, rol: 'Cajero' });
  assert.equal(verifyToken(token).rol, 'Cajero');
  const [body, sig] = token.split('.');
  const fake = Buffer.from(JSON.stringify({ id: 1, rol: 'Administrador', exp: 9e9 })).toString('base64url');
  assert.equal(verifyToken(`${fake}.${sig}`), null);
  assert.equal(verifyToken(`${body}.x`), null);
  assert.equal(verifyToken(createToken({ id: 1 }, -10)), null);
});

test('validador: tipos, obligatorios y listas de objetos', () => {
  const data = validate(
    { nombre: '  Pizza ', precio: '10,5', items: '[{"id":"3","cantidad":2}]' },
    {
      nombre: { type: 'string', required: true },
      precio: { type: 'number', min: 0 },
      items: { type: 'array', items: { type: 'object', schema: { id: { type: 'integer', required: true }, cantidad: { type: 'integer', min: 1 } } } },
    },
  );
  assert.deepEqual(data, { nombre: 'Pizza', precio: 10.5, items: [{ id: 3, cantidad: 2 }] });
  assert.throws(() => validate({}, { nombre: { type: 'string', required: true } }), (err) => err.status === 422);
});

test('seguimiento: el código se acepta con o sin "PED-", en minúsculas o con espacios', async () => {
  const { normalizarCodigo } = await import('../src/services/seguimiento.service.js');
  for (const input of ['PED-AB12', 'ped-ab12', 'ab12', ' ped ab12 ', 'PEDAB12']) assert.equal(normalizarCodigo(input), 'PED-AB12');
  assert.equal(normalizarCodigo('PEDK'), 'PED-PEDK'); // un código que empieza con P-E-D no se recorta
});

test('cocina: un producto va a la cocina salvo que alguna categoría sea "sin cocina"', async () => {
  const { vaACocina } = await import('../src/services/pedidos.service.js');
  assert.equal(vaACocina({ categorias: [{ va_a_cocina: true }, { va_a_cocina: true }] }), true);
  assert.equal(vaACocina({ categorias: [{ va_a_cocina: false }, { va_a_cocina: true }] }), false);
  assert.equal(vaACocina({ categorias: [] }), true);
});

test('mesa: código de 4 dígitos y token de acceso que no vale como sesión ni seguimiento', async () => {
  const { codigoCorrecto } = await import('../src/services/mesas.service.js');
  const { readMesaAcceso, readSeguimiento, readSession } = await import('../src/middlewares/auth.js');
  assert.ok(codigoCorrecto('4821', '4821'));
  assert.ok(codigoCorrecto(' 48-21 ', '4821'));
  assert.ok(!codigoCorrecto('4820', '4821'));
  assert.ok(!codigoCorrecto('', '4821'));
  const req = (cookie) => ({ headers: { cookie } });
  const acceso = createToken({ typ: 'mesa', aid: 7 });
  assert.equal(readMesaAcceso(req(`ap_mesa=${acceso}`)), 7);
  assert.equal(readSession(req(`ap_session=${acceso}`)), null);
  assert.equal(readSeguimiento(req(`ap_seguimiento=${acceso}`)), null);
  assert.equal(readMesaAcceso(req(`ap_mesa=${createToken({ id: 1, rol: 'Mozo' })}`)), null);
});

test('paquetes: roles habilitados, licencia y colores de la marca', async () => {
  const { DEFAULTS, estadoLicencia, licenciaBloqueada, paletaMarca, rolesHabilitados } = await import('../src/services/config.service.js');
  const cfg = (cambios) => ({ ...structuredClone(DEFAULTS), ...cambios });
  assert.deepEqual(rolesHabilitados(cfg({})), ['Administrador', 'Cajero', 'Cocina', 'Mozo', 'Cliente']);
  assert.deepEqual(rolesHabilitados(cfg({ paquete: { tipo: 'totem', cocina: true } })), ['Administrador', 'Cliente', 'Cocina']);
  assert.deepEqual(rolesHabilitados(cfg({ paquete: { tipo: 'totem', cocina: false } })), ['Administrador', 'Cliente']);

  const lic = (licencia) => cfg({ licencia: { suspendida: false, motivo: '', ...licencia } });
  assert.equal(estadoLicencia(lic({ vence: null }), '2026-10-21').estado, 'ok');
  assert.equal(estadoLicencia(lic({ vence: '2026-12-01' }), '2026-10-21').estado, 'ok');
  assert.equal(estadoLicencia(lic({ vence: '2026-10-25' }), '2026-10-21').estado, 'por_vencer');
  assert.equal(estadoLicencia(lic({ vence: '2026-10-21' }), '2026-10-21').estado, 'por_vencer', 'el día del vencimiento todavía funciona');
  assert.equal(estadoLicencia(lic({ vence: '2026-10-20' }), '2026-10-21').estado, 'vencida');
  assert.equal(estadoLicencia(lic({ vence: null, suspendida: true }), '2026-10-21').estado, 'suspendida');
  assert.ok(licenciaBloqueada(lic({ vence: '2026-10-20' }), '2026-10-21'));
  assert.ok(!licenciaBloqueada(lic({ vence: '2026-10-21' }), '2026-10-21'));

  const p = paletaMarca('#ff5722');
  assert.equal(p.brand, '#ff5722');
  assert.match(p.dark, /^#[0-9a-f]{6}$/);
  assert.equal(paletaMarca('cualquier-cosa').brand, '#ff5722', 'color inválido → el de siempre');
});

test('superadmin: su token no vale si no está configurado', async () => {
  const { loadUser } = await import('../src/middlewares/auth.js');
  const token = createToken({ id: 0, nombre: 'Superadmin', rol: 'Superadmin', sa: true });
  const req = { headers: { cookie: `ap_session=${token}` } };
  await loadUser(req, {}, () => {});
  assert.equal(req.user, undefined);
});
