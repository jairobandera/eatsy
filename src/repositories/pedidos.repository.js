import { sql } from '../db/connection.js';
import { now } from '../utils/dates.js';
import { likePattern } from '../utils/text.js';
import { limitClause } from './base.repository.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const BASE_SELECT = `
  SELECT p.*,
         u.nombre AS u_nombre, u.rol AS u_rol,
         c.nombre AS c_nombre, c.apellido AS c_apellido, c.cedula AS c_cedula, c.telefono AS c_telefono, c.puntos AS c_puntos,
         pg.id AS pg_id, pg.tipo AS pg_tipo, pg.monto AS pg_monto, pg.estado AS pg_estado, pg.fecha AS pg_fecha,
         pp.cantidad AS puntos_generados,
         (SELECT COUNT(*) FROM detalle_pedido dc WHERE dc.pedido_id = p.id AND dc.para_cocina = 1) AS items_cocina
    FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN clientes c ON c.id = p.cliente_id
    LEFT JOIN pagos pg ON pg.pedido_id = p.id
    LEFT JOIN punto_pedido pp ON pp.pedido_id = p.id AND pp.tipo = 'Canjeo'`;

function toDto(r) {
  return {
    id: r.id,
    codigo: r.codigo,
    origen: r.origen,
    mesa: r.mesa ?? null,
    mesa_abierta_id: r.mesa_abierta_id ?? null,
    estado: r.estado,
    metodo_pago: r.metodo_pago,
    total: round2(r.total),
    created_at: r.created_at,
    updated_at: r.updated_at,
    usuario: { id: r.usuario_id, nombre: r.u_nombre, rol: r.u_rol },
    cliente: r.cliente_id
      ? { id: r.cliente_id, nombre: r.c_nombre, apellido: r.c_apellido, cedula: r.c_cedula, telefono: r.c_telefono, puntos: r.c_puntos }
      : null,
    pago: r.pg_id ? { id: r.pg_id, tipo: r.pg_tipo, monto: round2(r.pg_monto), estado: r.pg_estado, fecha: r.pg_fecha } : null,
    puntos_generados: r.puntos_generados ?? null,
    requiere_cocina: Number(r.items_cocina) > 0,
    cupon: r.cupon_codigo ? { promocion_id: r.promocion_id, codigo: r.cupon_codigo, descuento: round2(r.descuento_cupon) } : null,
  };
}

/** Carga los detalles (con ingredientes quitados) de varios pedidos en 2 consultas. */
async function attachDetalles(pedidos) {
  if (!pedidos.length) return pedidos;
  const ids = pedidos.map((p) => p.id);
  const detalles = await sql.all(
    `SELECT d.*, pr.nombre AS producto_nombre, pr.imagen AS producto_imagen
       FROM detalle_pedido d JOIN productos pr ON pr.id = d.producto_id
      WHERE d.pedido_id IN (?) ORDER BY d.id`,
    [ids],
  );
  const detalleIds = detalles.map((d) => d.id);
  const quitados = detalleIds.length
    ? await sql.all(
        `SELECT q.detalle_pedido_id, i.id, i.nombre
           FROM detalle_pedido_ingrediente_quitado q JOIN ingredientes i ON i.id = q.ingrediente_id
          WHERE q.detalle_pedido_id IN (?) ORDER BY i.nombre`,
        [detalleIds],
      )
    : [];

  const extras = detalleIds.length
    ? await sql.all(
        `SELECT e.detalle_pedido_id, i.id, i.nombre, e.cantidad, e.precio_unitario
           FROM detalle_pedido_ingrediente_extra e JOIN ingredientes i ON i.id = e.ingrediente_id
          WHERE e.detalle_pedido_id IN (?) ORDER BY i.nombre`,
        [detalleIds],
      )
    : [];
  const extrasPorDetalle = new Map();
  for (const e of extras) {
    if (!extrasPorDetalle.has(e.detalle_pedido_id)) extrasPorDetalle.set(e.detalle_pedido_id, []);
    extrasPorDetalle.get(e.detalle_pedido_id).push({ id: e.id, nombre: e.nombre, cantidad: e.cantidad, precio: round2(e.precio_unitario) });
  }

  const quitadosPorDetalle = new Map();
  for (const q of quitados) {
    if (!quitadosPorDetalle.has(q.detalle_pedido_id)) quitadosPorDetalle.set(q.detalle_pedido_id, []);
    quitadosPorDetalle.get(q.detalle_pedido_id).push({ id: q.id, nombre: q.nombre });
  }

  const porPedido = new Map(pedidos.map((p) => [p.id, { ...p, detalles: [] }]));
  for (const d of detalles) {
    porPedido.get(d.pedido_id).detalles.push({
      id: d.id,
      producto_id: d.producto_id,
      producto: { id: d.producto_id, nombre: d.producto_nombre, imagen: d.producto_imagen },
      cantidad: d.cantidad,
      precio_unitario: round2(d.precio_unitario),
      descuento: round2(d.descuento),
      subtotal: round2(d.subtotal),
      para_cocina: Boolean(d.para_cocina),
      quitados: quitadosPorDetalle.get(d.id) || [],
      extras: extrasPorDetalle.get(d.id) || [],
    });
  }
  return [...porPedido.values()];
}

export const pedidosRepo = {
  async findIdByCodigo(codigo) {
    const row = await sql.get('SELECT id FROM pedidos WHERE codigo = ?', [codigo]);
    return row?.id ?? null;
  },

  async existsCodigo(codigo) {
    return Boolean(await sql.get('SELECT 1 AS x FROM pedidos WHERE codigo = ?', [codigo]));
  },

  async findById(id, { withDetalles = true, forUpdate = false } = {}) {
    const row = await sql.get(`${BASE_SELECT} WHERE p.id = ? ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
    if (!row) return null;
    const dto = toDto(row);
    return withDetalles ? (await attachDetalles([dto]))[0] : dto;
  },

  /**
   * Listado flexible de pedidos.
   * @param {{estados?: string[], excluirEstados?: string[], fechaCampo?: 'created_at'|'updated_at', fecha?: string,
   *          search?: string, order?: 'asc'|'desc', limit?: number, offset?: number, withDetalles?: boolean,
   *          excluirOrigen?: string}} opts
   */
  async list({ estados, excluirEstados, fechaCampo = 'created_at', fecha, search, order = 'desc', limit, offset = 0, withDetalles = false, excluirOrigen } = {}) {
    const where = [];
    const params = [];
    if (excluirOrigen) {
      where.push('p.origen <> ?');
      params.push(excluirOrigen);
    }
    if (estados?.length) {
      where.push('p.estado IN (?)');
      params.push(estados);
    }
    if (excluirEstados?.length) {
      where.push('p.estado NOT IN (?)');
      params.push(excluirEstados);
    }
    if (fecha) {
      const col = fechaCampo === 'updated_at' ? 'p.updated_at' : 'p.created_at';
      // Rango en vez de DATE(col) para poder usar el índice.
      where.push(`${col} BETWEEN ? AND ?`);
      params.push(`${fecha} 00:00:00`, `${fecha} 23:59:59`);
    }
    if (search) {
      const pattern = likePattern(search);
      where.push(`(p.codigo LIKE ? OR c.cedula LIKE ? OR CONCAT(c.nombre, ' ', c.apellido) LIKE ?)`);
      params.push(pattern, pattern, pattern);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = limitClause(limit, offset);
    const [{ c: total }] = await sql.all(`SELECT COUNT(*) AS c FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id ${w}`, params);
    const dir = order === 'asc' ? 'ASC' : 'DESC';
    const rows = (await sql.all(`${BASE_SELECT} ${w} ORDER BY p.id ${dir} ${lim.clause}`, [...params, ...lim.params])).map(toDto);
    return { rows: withDetalles ? await attachDetalles(rows) : rows, total: Number(total) };
  },

  /** Pedidos (sin cancelar) de las aperturas de mesa indicadas, con detalles. */
  async deAperturas(ids) {
    if (!ids.length) return [];
    const rows = (await sql.all(`${BASE_SELECT} WHERE p.mesa_abierta_id IN (?) AND p.estado <> 'Cancelado' ORDER BY p.id`, [ids])).map(toDto);
    return attachDetalles(rows);
  },

  async insert({ usuario_id, cliente_id, origen, mesa = null, mesa_abierta_id = null, metodo_pago, estado, codigo, total = 0, promocion_id = null, cupon_codigo = null, descuento_cupon = 0 }) {
    const ts = now();
    const r = await sql.run('INSERT INTO pedidos SET ?', [
      {
        usuario_id,
        cliente_id: cliente_id ?? null,
        promocion_id,
        cupon_codigo,
        descuento_cupon,
        origen,
        mesa,
        mesa_abierta_id,
        total,
        metodo_pago,
        estado,
        codigo,
        created_at: ts,
        updated_at: ts,
      },
    ]);
    return r.insertId;
  },

  async insertDetalle({ pedido_id, producto_id, cantidad, precio_unitario, descuento, subtotal, para_cocina = true, quitados = [], extras = [] }) {
    const r = await sql.run('INSERT INTO detalle_pedido SET ?', [
      { pedido_id, producto_id, cantidad, precio_unitario, descuento, subtotal, para_cocina: para_cocina ? 1 : 0, created_at: now() },
    ]);
    if (quitados.length) {
      await sql.run('INSERT INTO detalle_pedido_ingrediente_quitado (detalle_pedido_id, ingrediente_id) VALUES ?', [
        quitados.map((ingId) => [r.insertId, ingId]),
      ]);
    }
    if (extras.length) {
      await sql.run('INSERT INTO detalle_pedido_ingrediente_extra (detalle_pedido_id, ingrediente_id, cantidad, precio_unitario) VALUES ?', [
        extras.map((e) => [r.insertId, e.id, e.cantidad, e.precio]),
      ]);
    }
    return r.insertId;
  },

  async deleteDetalles(pedidoId) {
    await sql.run('DELETE FROM detalle_pedido WHERE pedido_id = ?', [pedidoId]);
  },

  async update(id, data) {
    await sql.run('UPDATE pedidos SET ? WHERE id = ?', [{ ...data, updated_at: now() }, id]);
  },

  async insertPago({ pedido_id, tipo, monto, estado = 'Pendiente' }) {
    const ts = now();
    await sql.run('INSERT INTO pagos SET ?', [{ pedido_id, tipo, monto, fecha: ts, estado, created_at: ts, updated_at: ts }]);
  },

  async updatePago(pedidoId, data) {
    await sql.run('UPDATE pagos SET ? WHERE pedido_id = ?', [{ ...data, updated_at: now() }, pedidoId]);
  },

  findPagoById(pagoId) {
    return sql.get('SELECT * FROM pagos WHERE id = ?', [pagoId]);
  },

  async existePuntos(pedidoId) {
    return Boolean(await sql.get(`SELECT 1 AS x FROM punto_pedido WHERE pedido_id = ? AND tipo = 'Canjeo'`, [pedidoId]));
  },

  async insertPuntos({ cliente_id, pedido_id, cantidad, tipo = 'Canjeo' }) {
    const ts = now();
    await sql.run('INSERT INTO punto_pedido SET ?', [{ cliente_id, pedido_id, cantidad, tipo, fecha: ts, created_at: ts }]);
  },
};
