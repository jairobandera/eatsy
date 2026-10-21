import { sql } from '../db/connection.js';
import { now } from '../utils/dates.js';
import { createRepository } from './base.repository.js';

const base = createRepository({ table: 'promociones', defaultOrder: 'id DESC' });

export const promocionesRepo = {
  ...base,

  async list(opts = {}) {
    const result = await base.list(opts);
    const ids = result.rows.map((r) => r.id);
    const counts = ids.length
      ? await sql.all(
          'SELECT promocion_id, COUNT(*) AS c FROM producto_promocion WHERE promocion_id IN (?) GROUP BY promocion_id',
          [ids],
        )
      : [];
    const map = new Map(counts.map((c) => [c.promocion_id, Number(c.c)]));
    result.rows = result.rows.map((r) => ({ ...r, productos_count: map.get(r.id) || 0 }));
    return result;
  },

  async productos(promocionId) {
    const rows = await sql.all(
      `SELECT p.id, p.nombre, p.precio, p.imagen, p.activo
         FROM producto_promocion pp JOIN productos p ON p.id = pp.producto_id
        WHERE pp.promocion_id = ? ORDER BY p.nombre`,
      [promocionId],
    );
    return rows.map((p) => ({ ...p, activo: Boolean(p.activo) }));
  },

  async syncProductos(promocionId, productIds) {
    await sql.run('DELETE FROM producto_promocion WHERE promocion_id = ?', [promocionId]);
    if (productIds.length) {
      await sql.run('INSERT INTO producto_promocion (producto_id, promocion_id) VALUES ?', [productIds.map((pid) => [pid, promocionId])]);
    }
  },

  /** Cupón activo y vigente en `fecha` con ese código, con los ids de sus productos. */
  async findCuponVigente(codigo, fecha) {
    const promo = await sql.get(
      `SELECT * FROM promociones
        WHERE codigo = ? AND activo = 1 AND tipo_descuento = 'monto'
          AND (fecha_inicio IS NULL OR fecha_inicio <= ?) AND (fecha_fin IS NULL OR fecha_fin >= ?)
        LIMIT 1`,
      [codigo, fecha, fecha],
    );
    if (!promo) return null;
    const rows = await sql.all('SELECT producto_id FROM producto_promocion WHERE promocion_id = ?', [promo.id]);
    return { ...promo, productos: rows.map((r) => r.producto_id) };
  },

  /** ¿Hay otra promoción activa con el mismo código? */
  async codigoEnUso(codigo, excludeId = 0) {
    return Boolean(await sql.get('SELECT 1 AS x FROM promociones WHERE codigo = ? AND activo = 1 AND id <> ? LIMIT 1', [codigo, excludeId]));
  },

  /** Deshabilita todos los cupones (promociones con código). Devuelve cuántos. */
  async deshabilitarConCodigo() {
    const r = await sql.run('UPDATE promociones SET activo = 0, updated_at = ? WHERE activo = 1 AND codigo IS NOT NULL', [now()]);
    return r.affectedRows;
  },

  /** Deshabilita las promociones cuya fecha de fin ya pasó. */
  async deactivateExpired(hoy) {
    const result = await sql.run(
      'UPDATE promociones SET activo = 0, updated_at = ? WHERE activo = 1 AND fecha_fin IS NOT NULL AND fecha_fin < ?',
      [now(), hoy],
    );
    return result.affectedRows;
  },
};
