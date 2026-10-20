/**
 * Migraciones incrementales e idempotentes: se ejecutan en cada arranque y solo
 * aplican lo que falte. Así una base creada con una versión anterior se actualiza sola.
 */

import { categoriasSinCocina, preciosExtra } from './seed-data.js';

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

/** Redefine una columna ENUM si todavía no tiene el valor indicado (para sumar opciones). */
async function ensureEnumValue(conn, table, column, value, definition) {
  const [rows] = await conn.query(
    'SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column],
  );
  if (!rows.length || rows[0].t.includes(`'${value}'`)) return;
  await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition}`);
  console.log(`  · migración: ${table}.${column} acepta '${value}'`);
}

async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    [table, index],
  );
  return rows.length > 0;
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

  // Mozos: rol nuevo, QR propio para sus mesas, pedidos con número de mesa y estado "En Mesa".
  await ensureEnumValue(conn, 'usuarios', 'rol', 'Mozo', `ENUM('Administrador', 'Cajero', 'Cocina', 'Cliente', 'Mozo') NOT NULL`);
  if (await addColumn(conn, 'usuarios', 'qr_token', 'VARCHAR(40) NULL AFTER rol')) {
    await conn.query('ALTER TABLE usuarios ADD UNIQUE KEY uq_usuarios_qr (qr_token)');
  }
  await ensureEnumValue(conn, 'pedidos', 'origen', 'Mozo', `ENUM('Caja', 'Kiosco', 'Mozo') NOT NULL`);
  await ensureEnumValue(conn, 'pedidos', 'estado', 'En Mesa', `ENUM('Cancelado', 'Recibido', 'En Preparacion', 'Listo', 'Entregado', 'En Mesa') NOT NULL`);
  await addColumn(conn, 'pedidos', 'mesa', 'SMALLINT UNSIGNED NULL AFTER origen');
  if (!(await indexExists(conn, 'pedidos', 'idx_pedidos_mesa'))) {
    await conn.query('ALTER TABLE pedidos ADD INDEX idx_pedidos_mesa (usuario_id, mesa)');
  }

  // Cocina solo recibe lo que se elabora: bebidas, postres, etc. los despacha la caja.
  if (await addColumn(conn, 'categorias', 'va_a_cocina', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER nombre')) {
    // Base existente: valores sugeridos (se pueden cambiar en Admin → Categorías).
    await conn.query('UPDATE categorias SET va_a_cocina = 0 WHERE nombre IN (?)', [categoriasSinCocina]);
  }
  await addColumn(conn, 'detalle_pedido', 'para_cocina', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER subtotal');
}
