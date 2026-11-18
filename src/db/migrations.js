/**
 * Migraciones incrementales e idempotentes: se ejecutan en cada arranque (después de schema.sql)
 * y solo aplican lo que falte. Así una base creada con una versión anterior se actualiza sola.
 *
 * La base PostgreSQL arrancó de cero con el esquema completo, así que por ahora no hay pasos.
 * Para un cambio futuro en una tabla existente, agregalo acá además de en schema.sql, por ejemplo:
 *
 *   await addColumn(sql, 'pedidos', 'nota', 'VARCHAR(200) NULL');
 */

/** ¿Existe la columna en el esquema de la app (el primero del search_path)? */
export async function columnExists(sql, table, column) {
  const row = await sql.get(
    'SELECT 1 AS x FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?',
    [table, column],
  );
  return Boolean(row);
}

/** @returns {Promise<boolean>} true si la columna se creó ahora */
export async function addColumn(sql, table, column, definition) {
  if (await columnExists(sql, table, column)) return false;
  await sql.run(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  console.log(`  · migración: ${table}.${column} agregada`);
  return true;
}

// eslint-disable-next-line no-unused-vars
export async function runMigrations(sql) {
  // Sin migraciones pendientes.
}
