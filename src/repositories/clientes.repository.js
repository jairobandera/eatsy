import { sql } from '../db/connection.js';
import { now } from '../utils/dates.js';
import { likePattern } from '../utils/text.js';
import { createRepository, toBool } from './base.repository.js';

const base = createRepository({ table: 'clientes', defaultOrder: 'apellido ASC, nombre ASC' });

export const clientesRepo = {
  ...base,

  async findByCedula(cedula) {
    return toBool(await sql.get('SELECT * FROM clientes WHERE cedula = ?', [cedula]), 'activo');
  },

  /** Búsqueda parcial por cédula (autocompletado de caja). */
  async searchByCedula(term, limit = 10) {
    const rows = await sql.all('SELECT * FROM clientes WHERE cedula LIKE ? ORDER BY cedula LIMIT ?', [likePattern(term), limit]);
    return rows.map((r) => toBool(r, 'activo'));
  },

  async addPuntos(id, cantidad) {
    await sql.run('UPDATE clientes SET puntos = puntos + ?, updated_at = ? WHERE id = ?', [cantidad, now(), id]);
  },
};

export const reglasPuntosRepo = {
  list() {
    return sql.all('SELECT * FROM reglas_puntos ORDER BY monto_min ASC');
  },

  findById(id) {
    return sql.get('SELECT * FROM reglas_puntos WHERE id = ?', [id]);
  },

  /** Tramo que contiene el monto (si hay varios, el de mayor monto mínimo). */
  findByTotal(total) {
    return sql.get('SELECT * FROM reglas_puntos WHERE monto_min <= ? AND monto_max >= ? ORDER BY monto_min DESC LIMIT 1', [total, total]);
  },

  /** Busca algún tramo que se superponga con [min, max]. */
  findOverlap(min, max, excludeId = 0) {
    return sql.get('SELECT * FROM reglas_puntos WHERE id <> ? AND monto_min <= ? AND monto_max >= ? LIMIT 1', [excludeId, max, min]);
  },

  async insert({ monto_min, monto_max, puntos_base }) {
    const ts = now();
    const r = await sql.run('INSERT INTO reglas_puntos SET ?', [{ monto_min, monto_max, puntos_base, created_at: ts, updated_at: ts }]);
    return r.insertId;
  },

  async update(id, { monto_min, monto_max, puntos_base }) {
    const r = await sql.run('UPDATE reglas_puntos SET ? WHERE id = ?', [{ monto_min, monto_max, puntos_base, updated_at: now() }, id]);
    return r.affectedRows > 0;
  },

  async delete(id) {
    const r = await sql.run('DELETE FROM reglas_puntos WHERE id = ?', [id]);
    return r.affectedRows > 0;
  },
};
