/**
 * Migraciones incrementales e idempotentes: se ejecutan en cada arranque y solo
 * aplican lo que falte. Así una base creada con una versión anterior se actualiza sola.
 */

import { preciosExtra } from './seed-data.js';

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column],
  );
  return rows.length > 0;
}

/** @returns {Promise<boolean>} true si la columna se creó ahora */
async function addColumn(conn, table, column, definition) {
  if (await columnExists(conn, table, column)) return false;
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`  · migración: ${table}.${column} agregada`);
  return true;
}

/** @param {import('mysql2/promise').Connection} conn conexión ya posicionada en la base */
export async function runMigrations(conn) {
  // Extras de ingredientes: precio por unidad extra (NULL = no se ofrece como extra).
  if (await addColumn(conn, 'ingredientes', 'precio_extra', 'DECIMAL(10,2) NULL AFTER descripcion')) {
    // Base existente: cargamos precios de extra sugeridos (se pueden cambiar en Admin → Ingredientes).
    for (const [nombre, precio] of Object.entries(preciosExtra)) {
      await conn.query('UPDATE ingredientes SET precio_extra = ? WHERE nombre = ?', [precio, nombre]);
    }
  }

  // Cupones (promociones con código) aplicados al total del pedido.
  await addColumn(conn, 'pedidos', 'promocion_id', 'INT UNSIGNED NULL AFTER cliente_id');
  await addColumn(conn, 'pedidos', 'cupon_codigo', 'VARCHAR(30) NULL AFTER promocion_id');
  await addColumn(conn, 'pedidos', 'descuento_cupon', 'DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER cupon_codigo');

  // Desde esta versión el código solo existe en promociones de monto fijo (cupones).
  await conn.query(`UPDATE promociones SET codigo = NULL WHERE tipo_descuento = 'porcentaje' AND codigo IS NOT NULL`);
}
