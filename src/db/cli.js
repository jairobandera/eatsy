/**
 * Utilidades de base de datos:
 *   npm run db:reset   → borra todas las tablas, recrea el esquema y carga los datos base
 *   npm run db:seed    → carga los datos base (solo si no hay usuarios)
 *   npm run db:demo    → agrega pedidos de ejemplo de los últimos 14 días (para estadísticas)
 */
import { closeDatabase, dropAllTables, initDatabase, sql } from './connection.js';
import { seedBase, seedDemo } from './seed.js';

const command = process.argv[2];

try {
  await initDatabase();

  if (command === 'reset') {
    await dropAllTables();
    await initDatabase();
    await seedBase();
  } else if (command === 'seed') {
    const { c } = await sql.get('SELECT COUNT(*) AS c FROM usuarios');
    if (Number(c) > 0) console.log('La base ya tiene datos. Usá `npm run db:reset` para empezar de cero.');
    else await seedBase();
  } else if (command === 'demo') {
    await seedDemo();
  } else {
    console.log('Uso: node src/db/cli.js <reset|seed|demo>');
  }
} catch (err) {
  console.error('✖ Error:', err.message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
