/**
 * Utilidades de base de datos (respetan APP_MODE):
 *   npm run db:reset   → borra TODAS las tablas y vuelve a inicializar
 *                        (demo: datos de prueba · produccion: vacía, solo el admin)
 *   npm run db:seed    → inicializa solo si la base no tiene usuarios
 *   npm run db:demo    → agrega pedidos de ejemplo de los últimos 14 días (solo en modo demo)
 *
 * En modo producción, `reset` pide confirmación escribiendo: npm run db:reset -- --confirmar
 */
import config from '../config/index.js';
import { closeDatabase, dropAllTables, initDatabase, sql } from './connection.js';
import { seedDemo, seedInicial } from './seed.js';

const [command, ...flags] = process.argv.slice(2);

try {
  await initDatabase();
  console.log(`Modo: ${config.appMode} · Base: ${config.db.database}@${config.db.host}`);

  if (command === 'reset') {
    if (!config.isDemo && !flags.includes('--confirmar')) {
      throw new Error('Estás en modo PRODUCCIÓN: esto borra todos los datos. Si estás seguro: npm run db:reset -- --confirmar');
    }
    await dropAllTables();
    await initDatabase();
    await seedInicial();
  } else if (command === 'seed') {
    const { c } = await sql.get('SELECT COUNT(*) AS c FROM usuarios');
    if (Number(c) > 0) console.log('La base ya tiene datos. Usá `npm run db:reset` para empezar de cero.');
    else await seedInicial();
  } else if (command === 'demo') {
    if (!config.isDemo) throw new Error('Los pedidos de ejemplo solo se generan en modo demo (APP_MODE=demo).');
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
