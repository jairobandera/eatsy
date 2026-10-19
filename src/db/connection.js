import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import mysql from 'mysql2/promise';
import config from '../config/index.js';
import { runMigrations } from './migrations.js';

/**
 * Pool de conexiones MySQL/MariaDB.
 *  - dateStrings: las fechas llegan como 'YYYY-MM-DD HH:MM:SS' (hora local del negocio).
 *  - decimalNumbers: los DECIMAL llegan como number.
 */
const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: config.db.connectionLimit,
  charset: 'utf8mb4_unicode_ci',
  dateStrings: true,
  decimalNumbers: true,
  supportBigNumbers: true,
  waitForConnections: true,
});

// Guarda la conexión de la transacción activa para que los repositorios la usen
// automáticamente, sin tener que pasarla por parámetro.
const txStorage = new AsyncLocalStorage();

const executor = () => txStorage.getStore() ?? pool;

/** Atajos de consulta (usa `?` como placeholder; mysql2 escapa los valores). */
export const sql = {
  async all(query, params = []) {
    const [rows] = await executor().query(query, params);
    return rows;
  },
  async get(query, params = []) {
    const [rows] = await executor().query(query, params);
    return rows[0] ?? null;
  },
  /** Devuelve { insertId, affectedRows }. */
  async run(query, params = []) {
    const [result] = await executor().query(query, params);
    return result;
  },
};

/** Ejecuta `fn` dentro de una transacción; si lanza, se hace ROLLBACK. */
export async function transaction(fn) {
  if (txStorage.getStore()) return fn();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await txStorage.run(conn, fn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Crea la base (si no existe) y aplica el esquema. Idempotente.
 */
export async function initDatabase() {
  const admin = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await admin.query(`USE \`${config.db.database}\``);
    const schema = fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8');
    await admin.query(schema);
    await runMigrations(admin);
  } finally {
    await admin.end();
  }
}

/** Borra todas las tablas (usado por `npm run db:reset`). */
export async function dropAllTables() {
  const tables = await sql.all('SHOW TABLES');
  if (!tables.length) return;
  const names = tables.map((t) => `\`${Object.values(t)[0]}\``).join(', ');
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query(`DROP TABLE IF EXISTS ${names}`);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    conn.release();
  }
}

export async function closeDatabase() {
  await pool.end();
}

export default pool;
