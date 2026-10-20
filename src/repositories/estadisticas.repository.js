import { sql } from '../db/connection.js';

// Todas las consultas reciben el rango como 'YYYY-MM-DD HH:MM:SS' (inicio y fin inclusive).

export const estadisticasRepo = {
  ventasDiarias(desde, hasta) {
    return sql.all(
      `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, ROUND(SUM(monto), 2) AS total
         FROM pagos WHERE estado = 'Completado' AND fecha BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(fecha, '%Y-%m-%d') ORDER BY 1`,
      [desde, hasta],
    );
  },

  ingresosPorHora(desde, hasta) {
    return sql.all(
      `SELECT HOUR(fecha) AS hora, ROUND(SUM(monto), 2) AS total
         FROM pagos WHERE estado = 'Completado' AND fecha BETWEEN ? AND ?
        GROUP BY HOUR(fecha) ORDER BY 1`,
      [desde, hasta],
    );
  },

  masVendidos(desde, hasta, limit = 5) {
    return sql.all(
      `SELECT pr.id, pr.nombre, SUM(d.cantidad) AS total_vendido, ROUND(SUM(d.subtotal), 2) AS importe
         FROM detalle_pedido d
         JOIN pedidos p ON p.id = d.pedido_id
         JOIN productos pr ON pr.id = d.producto_id
        WHERE p.estado IN ('Entregado', 'En Mesa') AND p.created_at BETWEEN ? AND ?
        GROUP BY pr.id, pr.nombre ORDER BY total_vendido DESC, importe DESC LIMIT ?`,
      [desde, hasta, limit],
    );
  },

  ventasPorCategoria(desde, hasta) {
    return sql.all(
      `SELECT c.nombre, SUM(d.cantidad) AS total_vendido
         FROM detalle_pedido d
         JOIN pedidos p ON p.id = d.pedido_id
         JOIN categoria_producto cp ON cp.producto_id = d.producto_id
         JOIN categorias c ON c.id = cp.categoria_id
        WHERE p.estado IN ('Entregado', 'En Mesa') AND p.created_at BETWEEN ? AND ?
        GROUP BY c.id, c.nombre ORDER BY total_vendido DESC`,
      [desde, hasta],
    );
  },

  pedidosPorEstado(desde, hasta) {
    return sql.all(
      'SELECT estado, COUNT(*) AS total FROM pedidos WHERE created_at BETWEEN ? AND ? GROUP BY estado ORDER BY total DESC',
      [desde, hasta],
    );
  },

  async resumen(desde, hasta) {
    const [ventas, pedidos, porMetodo] = await Promise.all([
      sql.get(
        `SELECT COALESCE(ROUND(SUM(monto), 2), 0) AS total, COUNT(*) AS cantidad
           FROM pagos WHERE estado = 'Completado' AND fecha BETWEEN ? AND ?`,
        [desde, hasta],
      ),
      sql.get(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(estado IN ('Entregado', 'En Mesa')), 0) AS entregados,
                COALESCE(SUM(estado = 'Cancelado'), 0) AS cancelados,
                COALESCE(SUM(origen = 'Kiosco'), 0) AS kiosco,
                COALESCE(SUM(origen = 'Caja'), 0) AS caja,
                COALESCE(SUM(origen = 'Mozo'), 0) AS mozo
           FROM pedidos WHERE created_at BETWEEN ? AND ?`,
        [desde, hasta],
      ),
      sql.all(
        `SELECT tipo, ROUND(SUM(monto), 2) AS total, COUNT(*) AS cantidad
           FROM pagos WHERE estado = 'Completado' AND fecha BETWEEN ? AND ? GROUP BY tipo`,
        [desde, hasta],
      ),
    ]);
    return { ventas, pedidos, porMetodo };
  },
};
