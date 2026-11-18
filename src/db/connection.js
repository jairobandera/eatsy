import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import config from '../config/index.js';
import { runMigrations } from './migrations.js';
import { convertirConsulta } from './sql-convert.js';

/**
 * Pool de conexiones PostgreSQL (ej. Supabase). Todas las tablas viven en su propio esquema
 * (DB_SCHEMA, por defecto "eatsy"), así la base se puede compartir con otros proyectos sin
 * tocar sus tablas: cada conexión fija `search_path` a ese esquema.
 *
 * Tipos: las fechas llegan como texto 'YYYY-MM-DD HH:MM:SS' / 'YYYY-MM-DD' (hora local del
 * negocio), NUMERIC y COUNT(*) como number.
 */
const PARSERS = {
  20: Number, // bigint (COUNT, SUM de enteros)
  1700: parseFloat, // numeric
  1082: (s) => s, // date
  1114: (s) => s, // timestamp sin zona
};
const types = { getTypeParser: (oid, format) => PARSERS[oid] ?? pg.types.getTypeParser(oid, format) };

const esquema = `"${config.db.schema}"`;

const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  ssl: config.db.ssl,
  max: config.db.connectionLimit,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
  types,
});

// Una conexión inactiva que se corta (reinicio de la base, red) no debe tirar el proceso.
pool.on('error', (err) => console.warn(`[db] conexión cerrada: ${err.code || err.message}`));

// Cada conexión trabaja solo en el esquema de la app: se fija una vez, antes de su primera consulta.
const preparadas = new WeakSet();
async function conectar() {
  const client = await pool.connect();
  if (!preparadas.has(client)) {
    try {
      await client.query(`SET search_path TO ${esquema}`);
    } catch (err) {
      client.release(err);
      throw err;
    }
    preparadas.add(client);
  }
  return client;
}

// Guarda la conexión de la transacción activa para que los repositorios la usen
// automáticamente, sin tener que pasarla por parámetro.
const txStorage = new AsyncLocalStorage();

async function query(q, params) {
  const { text, values } = convertirConsulta(q, params);
  const tx = txStorage.getStore();
  if (tx) return tx.query(text, values);
  const client = await conectar();
  try {
    return await client.query(text, values);
  } finally {
    client.release();
  }
}

/** Atajos de consulta (usa `?` como placeholder; ver sql-convert.js). */
export const sql = {
  async all(q, params = []) {
    return (await query(q, params)).rows;
  },
  async get(q, params = []) {
    return (await query(q, params)).rows[0] ?? null;
  },
  /** Devuelve { insertId, affectedRows } (insertId = id de la primera fila insertada). */
  async run(q, params = []) {
    const r = await query(q, params);
    return { insertId: r.rows?.[0]?.id ?? null, affectedRows: r.rowCount ?? 0 };
  },
};

/** Ejecuta `fn` dentro de una transacción; si lanza, se hace ROLLBACK. */
export async function transaction(fn) {
  if (txStorage.getStore()) return fn();
  const client = await conectar();
  try {
    await client.query('BEGIN');
    const result = await txStorage.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Crea el esquema (si no existe) y aplica las tablas. Idempotente. No toca nada fuera del esquema.
 */
export async function initDatabase() {
  const client = await conectar();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${esquema}`);
    const schema = fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
  } finally {
    client.release();
  }
  await runMigrations(sql);
}

/** Borra el esquema de la app con todas sus tablas (usado por `npm run db:reset`). */
export async function dropAllTables() {
  await pool.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`);
}

let latido = null;

/**
 * Consulta liviana periódica a la base mientras el servidor está prendido: las bases gratuitas
 * en la nube (ej. Supabase) se pausan si pasan días sin actividad. Complementa al cron que pega
 * a /api/salud.
 */
export function iniciarLatido({ cadaMs = config.db.keepaliveMs } = {}) {
  clearInterval(latido);
  if (!cadaMs) return;
  latido = setInterval(() => {
    pool.query('SELECT 1').catch((err) => console.warn(`[db] el latido a la base falló: ${err.code || err.message}`));
  }, cadaMs);
  latido.unref?.(); // no impide que el proceso se cierre
}

export async function closeDatabase() {
  clearInterval(latido);
  await pool.end();
}

export default pool;
