import { sql } from '../db/connection.js';
import { now } from '../utils/dates.js';

const SELECT = `
  SELECT m.id, m.mozo_id, m.numero, m.codigo, m.abierta_at, m.cerrada_at, u.nombre AS mozo_nombre
    FROM mesas_abiertas m JOIN usuarios u ON u.id = m.mozo_id`;

const toDto = (r) =>
  r && {
    id: r.id,
    numero: r.numero,
    codigo: r.codigo,
    abierta_at: r.abierta_at,
    cerrada_at: r.cerrada_at,
    abierta: !r.cerrada_at,
    mozo: { id: r.mozo_id, nombre: r.mozo_nombre },
  };

/** Aperturas de mesa (una fila por cada vez que se abre una mesa; abierta = cerrada_at NULL). */
export const mesasRepo = {
  async abrir({ mozoId, numero, codigo }) {
    const r = await sql.run('INSERT INTO mesas_abiertas SET ?', [{ mozo_id: mozoId, numero, codigo, abierta_at: now() }]);
    return r.insertId;
  },

  /** Mesa abierta con ese número (de cualquier mozo). forUpdate: bloquea dentro de una transacción. */
  async findAbiertaPorNumero(numero, { forUpdate = false } = {}) {
    return toDto(await sql.get(`${SELECT} WHERE m.numero = ? AND m.cerrada_at IS NULL ORDER BY m.id LIMIT 1 ${forUpdate ? 'FOR UPDATE' : ''}`, [numero]));
  },

  async findById(id) {
    return toDto(await sql.get(`${SELECT} WHERE m.id = ?`, [id]));
  },

  /** Mesas abiertas de un mozo (o de todos si mozoId es null), por número. */
  async listAbiertas({ mozoId = null } = {}) {
    const rows = await sql.all(`${SELECT} WHERE m.cerrada_at IS NULL ${mozoId ? 'AND m.mozo_id = ?' : ''} ORDER BY m.numero`, mozoId ? [mozoId] : []);
    return rows.map(toDto);
  },

  async cerrar(id) {
    await sql.run('UPDATE mesas_abiertas SET cerrada_at = ? WHERE id = ? AND cerrada_at IS NULL', [now(), id]);
  },
};
