import test from 'node:test';
import assert from 'node:assert/strict';
import { convertirConsulta } from '../src/db/sql-convert.js';
import { parsearDatabaseUrl } from '../src/config/index.js';

test('convierte ? en $n y expande listas para IN', () => {
  const r = convertirConsulta('SELECT * FROM t WHERE a = ? AND b IN (?) LIMIT ?', [1, [2, 3], 10]);
  assert.equal(r.text, 'SELECT * FROM t WHERE a = $1 AND b IN ($2, $3) LIMIT $4');
  assert.deepEqual(r.values, [1, 2, 3, 10]);
});

test('lista vacía en IN no coincide con nada', () => {
  assert.equal(convertirConsulta('SELECT 1 FROM t WHERE id IN (?)', [[]]).text, 'SELECT 1 FROM t WHERE id IN (NULL)');
});

test('INSERT ... SET ? pasa a columnas y VALUES, con RETURNING para el id', () => {
  const r = convertirConsulta('INSERT INTO pedidos SET ?', [{ total: 10, activo: true, nota: undefined }]);
  assert.equal(r.text, 'INSERT INTO pedidos ("total", "activo", "nota") VALUES ($1, $2, $3) RETURNING *');
  assert.deepEqual(r.values, [10, 1, null]);
});

test('UPDATE ... SET ? expande el objeto', () => {
  const r = convertirConsulta('UPDATE t SET ? WHERE id = ?', [{ a: 1, b: 'x' }, 5]);
  assert.equal(r.text, 'UPDATE t SET "a" = $1, "b" = $2 WHERE id = $3');
  assert.deepEqual(r.values, [1, 'x', 5]);
});

test('VALUES ? con varias filas', () => {
  const r = convertirConsulta('INSERT INTO cp (a, b) VALUES ?', [[[1, 2], [3, 4]]]);
  assert.equal(r.text, 'INSERT INTO cp (a, b) VALUES ($1, $2), ($3, $4) RETURNING *');
  assert.deepEqual(r.values, [1, 2, 3, 4]);
});

test('no toca ? dentro de textos ni comentarios', () => {
  const r = convertirConsulta("SELECT '¿?' AS x -- ¿qué?\n FROM t WHERE a = ?", [7]);
  assert.equal(r.text, "SELECT '¿?' AS x -- ¿qué?\n FROM t WHERE a = $1");
});

test('rechaza nombres de columna raros y cantidad de parámetros incorrecta', () => {
  assert.throws(() => convertirConsulta('UPDATE t SET ? WHERE id = 1', [{ 'a; DROP': 1 }]));
  assert.throws(() => convertirConsulta('SELECT ?', []));
  assert.throws(() => convertirConsulta('SELECT 1', [1]));
});

test('DATABASE_URL de Supabase con clave sin escapar (&, %, !, @)', () => {
  const r = parsearDatabaseUrl('postgresql://postgres.abc:x&Y9q-%tu!@G@aws-1-us-east-2.pooler.supabase.com:6543/postgres');
  assert.equal(r.user, 'postgres.abc');
  assert.equal(r.password, 'x&Y9q-%tu!@G');
  assert.equal(r.host, 'aws-1-us-east-2.pooler.supabase.com');
  assert.equal(r.port, 6543);
  assert.equal(r.database, 'postgres');
});

test('DATABASE_URL con clave escapada y parámetros', () => {
  const r = parsearDatabaseUrl('postgres://u:cl%40ve@localhost/app?sslmode=require');
  assert.equal(r.password, 'cl@ve');
  assert.equal(r.port, 5432);
  assert.equal(r.database, 'app');
  assert.equal(r.params.get('sslmode'), 'require');
});
