import { sql } from '../db/connection.js';
import { now } from '../utils/dates.js';
import { likePattern } from '../utils/text.js';

export const toBool = (row, ...fields) => {
  if (!row) return row;
  const out = { ...row };
  for (const f of fields) if (f in out) out[f] = Boolean(out[f]);
  return out;
};

/** Agrega "LIMIT ? OFFSET ?" solo si hay límite. */
export function limitClause(limit, offset = 0) {
  return limit ? { clause: 'LIMIT ? OFFSET ?', params: [limit, offset] } : { clause: '', params: [] };
}

/**
 * Repositorio genérico para tablas con `id`, `nombre`, `activo` y timestamps.
 * Todas las funciones son async.
 */
export function createRepository({ table, select = '*', defaultOrder = 'nombre ASC', map = (r) => toBool(r, 'activo') }) {
  return {
    table,

    async findById(id) {
      return map(await sql.get(`SELECT ${select} FROM ${table} WHERE id = ?`, [id]));
    },

    async list({ activo, buscar, limit, offset = 0, order = defaultOrder } = {}) {
      const where = [];
      const params = [];
      if (activo !== undefined) {
        where.push('activo = ?');
        params.push(activo ? 1 : 0);
      }
      if (buscar) {
        where.push('nombre LIKE ?');
        params.push(likePattern(buscar));
      }
      const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const lim = limitClause(limit, offset);
      const [{ c: total }] = await sql.all(`SELECT COUNT(*) AS c FROM ${table} ${w}`, params);
      const rows = await sql.all(`SELECT ${select} FROM ${table} ${w} ORDER BY ${order} ${lim.clause}`, [...params, ...lim.params]);
      return { rows: rows.map(map), total: Number(total) };
    },

    /** ¿Existe otro registro con el mismo nombre? (la colación ignora mayúsculas y tildes) */
    async existsByName(nombre, { excludeId = 0, onlyActive = false } = {}) {
      const row = await sql.get(
        `SELECT 1 AS x FROM ${table} WHERE nombre = ? AND id <> ? ${onlyActive ? 'AND activo = 1' : ''} LIMIT 1`,
        [String(nombre).trim(), excludeId],
      );
      return Boolean(row);
    },

    async insert(data) {
      const ts = now();
      const result = await sql.run(`INSERT INTO ${table} SET ?`, [{ ...data, created_at: ts, updated_at: ts }]);
      return result.insertId;
    },

    async update(id, data) {
      const result = await sql.run(`UPDATE ${table} SET ? WHERE id = ?`, [{ ...data, updated_at: now() }, id]);
      return result.affectedRows > 0;
    },

    async setActivo(id, activo) {
      const result = await sql.run(`UPDATE ${table} SET activo = ?, updated_at = ? WHERE id = ?`, [activo ? 1 : 0, now(), id]);
      return result.affectedRows > 0;
    },
  };
}
