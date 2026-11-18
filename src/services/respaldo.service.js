import fs from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';
import { sql } from '../db/connection.js';
import { now } from '../utils/dates.js';

/**
 * Respaldo completo del esquema de la app en un archivo .sql (estructura + datos), sin depender
 * de pg_dump (en Render no está). Se escribe por partes para no cargar toda la base en memoria.
 * Solo incluye el esquema de la app (DB_SCHEMA): nunca otros proyectos de la misma base.
 *
 * Para restaurarlo en una base PostgreSQL (el esquema no debe existir o tiene que estar vacío):
 *   psql "postgresql://usuario:clave@host:5432/postgres" -f respaldo.sql
 */
const LOTE = 500;
const ident = (nombre) => `"${String(nombre).replace(/"/g, '""')}"`;

/** Literal SQL de PostgreSQL (standard_conforming_strings: solo se duplican las comillas). */
function literal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

const schemaSql = () => fs.readFileSync(path.join(import.meta.dirname, '..', 'db', 'schema.sql'), 'utf8');

/** Tablas en el orden en que se crean (respeta las claves foráneas al insertar). */
const tablasEnOrden = (texto) => [...texto.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);

/** Nombre sugerido del archivo: respaldo-<negocio>-<fecha>.sql */
export function nombreRespaldo(negocio) {
  const slug = String(negocio || 'eatsy').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'eatsy';
  return `respaldo-${slug}-${now().replace(/[: ]/g, '-').slice(0, 16)}.sql`;
}

/**
 * Escribe el respaldo en `escribir(texto)` (por ejemplo, la respuesta HTTP).
 * @param {(chunk: string) => void | Promise<void>} escribir
 */
export async function generarRespaldo(escribir) {
  const esquema = ident(config.db.schema);
  const estructura = schemaSql();
  const existentes = new Set(
    (await sql.all(`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`)).map((r) => r.tablename),
  );
  const tablas = tablasEnOrden(estructura).filter((t) => existentes.has(t));

  await escribir(
    [
      `-- Respaldo de AutoPedido 2.0 · esquema ${config.db.schema} · ${now()}`,
      `-- ${tablas.length} tablas. Restaurar (con el esquema vacío o sin crear): psql "<DATABASE_URL>" -f este_archivo.sql`,
      'BEGIN;',
      `CREATE SCHEMA IF NOT EXISTS ${esquema};`,
      `SET LOCAL search_path TO ${esquema};`,
      '',
      '-- ───── Estructura',
      estructura.trim(),
      '',
    ].join('\n'),
  );

  for (const tabla of tablas) {
    await escribir(`\n-- ───── ${tabla}\n`);
    // Orden por la clave primaria: así la paginación por lotes no saltea ni repite filas.
    const pk = await sql.all(
      `SELECT a.attname AS col
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
        WHERE i.indisprimary AND c.relname = ? AND n.nspname = current_schema()
        ORDER BY a.attnum`,
      [tabla],
    );
    const orden = pk.length ? `ORDER BY ${pk.map((k) => ident(k.col)).join(', ')}` : '';
    for (let offset = 0; ; offset += LOTE) {
      const filas = await sql.all(`SELECT * FROM ${ident(tabla)} ${orden} LIMIT ? OFFSET ?`, [LOTE, offset]);
      if (!filas.length) break;
      const columnas = Object.keys(filas[0]).map(ident).join(', ');
      const valores = filas.map((f) => `(${Object.values(f).map(literal).join(', ')})`).join(',\n  ');
      await escribir(`INSERT INTO ${ident(tabla)} (${columnas}) VALUES\n  ${valores};\n`);
      if (filas.length < LOTE) break;
    }
    // Los ids siguen desde el último restaurado.
    if (pk.length === 1 && pk[0].col === 'id') {
      await escribir(`SELECT setval(pg_get_serial_sequence('${tabla}', 'id'), COALESCE((SELECT MAX(id) FROM ${ident(tabla)}), 0) + 1, false);\n`);
    }
  }

  await escribir('\nCOMMIT;\n-- Fin del respaldo\n');
}
