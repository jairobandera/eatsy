import mysql from 'mysql2';
import config from '../config/index.js';
import { sql } from '../db/connection.js';
import { now } from '../utils/dates.js';

/**
 * Respaldo completo de la base en un archivo .sql (estructura + datos), sin depender de mysqldump
 * (en Render no está). Se escribe por partes para no cargar toda la base en memoria.
 *
 * Para restaurarlo: crear una base vacía y ejecutar el archivo, por ejemplo
 *   mysql -u usuario -p nombre_base < respaldo.sql
 */
const LOTE = 500;
const ident = (nombre) => `\`${String(nombre).replace(/`/g, '``')}\``;

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
  const tablas = (await sql.all(`SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'`)).map((r) => Object.values(r)[0]);
  await escribir(
    [
      `-- Respaldo de AutoPedido 2.0 · base ${config.db.database} · ${now()}`,
      `-- ${tablas.length} tablas. Restaurar en una base vacía: mysql -u usuario -p base < este_archivo.sql`,
      'SET NAMES utf8mb4;',
      'SET FOREIGN_KEY_CHECKS = 0;',
      '',
    ].join('\n'),
  );

  for (const tabla of tablas) {
    const crear = Object.values(await sql.get(`SHOW CREATE TABLE ${ident(tabla)}`))[1];
    await escribir(`\n-- ───── ${tabla}\nDROP TABLE IF EXISTS ${ident(tabla)};\n${crear};\n`);

    // Orden por la clave primaria: así la paginación por lotes no saltea ni repite filas.
    const pk = (await sql.all(`SHOW KEYS FROM ${ident(tabla)} WHERE Key_name = 'PRIMARY'`)).sort((a, b) => a.Seq_in_index - b.Seq_in_index);
    const orden = pk.length ? `ORDER BY ${pk.map((k) => ident(k.Column_name)).join(', ')}` : '';
    for (let offset = 0; ; offset += LOTE) {
      const filas = await sql.all(`SELECT * FROM ${ident(tabla)} ${orden} LIMIT ? OFFSET ?`, [LOTE, offset]);
      if (!filas.length) break;
      const columnas = Object.keys(filas[0]).map(ident).join(', ');
      const valores = filas.map((f) => `(${Object.values(f).map((v) => mysql.escape(v)).join(', ')})`).join(',\n  ');
      await escribir(`INSERT INTO ${ident(tabla)} (${columnas}) VALUES\n  ${valores};\n`);
      if (filas.length < LOTE) break;
    }
  }

  await escribir('\nSET FOREIGN_KEY_CHECKS = 1;\n-- Fin del respaldo\n');
}
