import { sql } from '../db/connection.js';
import { likePattern } from '../utils/text.js';
import { createRepository, limitClause, toBool } from './base.repository.js';

const base = createRepository({ table: 'productos' });

const ORDERS = {
  nombre_asc: 'p.nombre ASC',
  nombre_desc: 'p.nombre DESC',
  precio_asc: 'p.precio ASC, p.nombre ASC',
  precio_desc: 'p.precio DESC, p.nombre ASC',
  recientes: 'p.id DESC',
};

/** Agrega `categorias` e `ingredientes` a cada producto en 2 consultas (evita N+1). */
async function withRelations(rows, { soloActivos = false } = {}) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const activos = soloActivos ? 'AND x.activo = 1' : '';

  const [cats, ings] = await Promise.all([
    sql.all(
      `SELECT cp.producto_id, x.id, x.nombre, x.activo, x.va_a_cocina
         FROM categoria_producto cp JOIN categorias x ON x.id = cp.categoria_id
        WHERE cp.producto_id IN (?) ${activos}
        ORDER BY x.nombre`,
      [ids],
    ),
    sql.all(
      `SELECT ip.producto_id, x.id, x.nombre, x.activo, x.precio_extra, ip.es_obligatorio, ip.permite_extra
         FROM ingrediente_producto ip JOIN ingredientes x ON x.id = ip.ingrediente_id
        WHERE ip.producto_id IN (?) ${activos}
        ORDER BY ip.es_obligatorio DESC, x.nombre`,
      [ids],
    ),
  ]);

  const byProduct = new Map(rows.map((r) => [r.id, { ...toBool(r, 'activo'), categorias: [], ingredientes: [] }]));
  for (const c of cats) {
    byProduct.get(c.producto_id).categorias.push({ id: c.id, nombre: c.nombre, activo: Boolean(c.activo), va_a_cocina: Boolean(c.va_a_cocina) });
  }
  for (const i of ings) {
    byProduct.get(i.producto_id).ingredientes.push({
      id: i.id,
      nombre: i.nombre,
      activo: Boolean(i.activo),
      es_obligatorio: Boolean(i.es_obligatorio),
      // Este producto permite pedirlo como extra (ej. carne extra en la hamburguesa sí, en la empanada no).
      permite_extra: Boolean(i.permite_extra),
      // Precio del extra en ESTE producto: null = no se ofrece (el ingrediente no tiene precio de extra
      // o el producto no lo permite). Kiosco, caja y validación del pedido usan este valor.
      precio_extra: i.permite_extra ? i.precio_extra : null,
      precio_extra_ingrediente: i.precio_extra,
    });
  }
  return [...byProduct.values()];
}

export const productosRepo = {
  ...base,

  async list({ activo, buscar, categoriaId, precioMin, precioMax, orden = 'nombre_asc', limit, offset = 0, soloActivos = false } = {}) {
    const where = [];
    const params = [];
    if (activo !== undefined) {
      where.push('p.activo = ?');
      params.push(activo ? 1 : 0);
    }
    if (buscar) {
      where.push('p.nombre LIKE ?');
      params.push(likePattern(buscar));
    }
    if (categoriaId) {
      where.push(
        `EXISTS (SELECT 1 FROM categoria_producto cp JOIN categorias c ON c.id = cp.categoria_id
                  WHERE cp.producto_id = p.id AND c.id = ? ${soloActivos ? 'AND c.activo = 1' : ''})`,
      );
      params.push(categoriaId);
    }
    if (precioMin != null) {
      where.push('p.precio >= ?');
      params.push(precioMin);
    }
    if (precioMax != null) {
      where.push('p.precio <= ?');
      params.push(precioMax);
    }

    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = limitClause(limit, offset);
    const [{ c: total }] = await sql.all(`SELECT COUNT(*) AS c FROM productos p ${w}`, params);
    const rows = await sql.all(
      `SELECT p.* FROM productos p ${w} ORDER BY ${ORDERS[orden] || ORDERS.nombre_asc} ${lim.clause}`,
      [...params, ...lim.params],
    );
    return { rows: await withRelations(rows, { soloActivos }), total: Number(total) };
  },

  async findFull(id, { soloActivos = false } = {}) {
    const row = await sql.get('SELECT * FROM productos WHERE id = ?', [id]);
    return row ? (await withRelations([row], { soloActivos }))[0] : null;
  },

  async findManyByIds(ids) {
    if (!ids.length) return [];
    return withRelations(await sql.all('SELECT * FROM productos WHERE id IN (?)', [ids]));
  },

  async syncCategorias(productoId, categoriaIds) {
    await sql.run('DELETE FROM categoria_producto WHERE producto_id = ?', [productoId]);
    if (categoriaIds.length) {
      await sql.run('INSERT INTO categoria_producto (producto_id, categoria_id) VALUES ?', [categoriaIds.map((cid) => [productoId, cid])]);
    }
  },

  /** @param {{id:number, es_obligatorio:boolean, permite_extra?:boolean}[]} ingredientes */
  async syncIngredientes(productoId, ingredientes) {
    await sql.run('DELETE FROM ingrediente_producto WHERE producto_id = ?', [productoId]);
    if (ingredientes.length) {
      await sql.run('INSERT INTO ingrediente_producto (producto_id, ingrediente_id, es_obligatorio, permite_extra) VALUES ?', [
        ingredientes.map((i) => [productoId, i.id, i.es_obligatorio ? 1 : 0, i.permite_extra === false ? 0 : 1]),
      ]);
    }
  },

  /** Promociones automáticas (sin código) vigentes en `fecha` (YYYY-MM-DD) para los productos indicados. */
  async promocionesVigentes(productIds, fecha) {
    if (!productIds.length) return [];
    return sql.all(
      `SELECT pp.producto_id, pr.id, pr.nombre, pr.tipo_descuento, pr.descuento
         FROM producto_promocion pp JOIN promociones pr ON pr.id = pp.promocion_id
        WHERE pr.activo = 1
          AND pr.codigo IS NULL -- las promos con código (cupones) no se aplican solas
          AND (pr.fecha_inicio IS NULL OR pr.fecha_inicio <= ?)
          AND (pr.fecha_fin IS NULL OR pr.fecha_fin >= ?)
          AND pp.producto_id IN (?)`,
      [fecha, fecha, productIds],
    );
  },
};
