import http from 'node:http';
import { createApp } from './src/app.js';
import config from './src/config/index.js';
import { closeDatabase, initDatabase, sql } from './src/db/connection.js';
import { seedInicial } from './src/db/seed.js';
import { readSeguimiento, readSession } from './src/middlewares/auth.js';
import { publicBaseUrl } from './src/utils/network.js';
import { closeRealtime, initRealtime } from './src/websocket/realtime.js';

async function main() {
  try {
    await initDatabase();
  } catch (err) {
    console.error(`\n✖ No se pudo conectar a MySQL en ${config.db.host}:${config.db.port} (${err.code || err.message}).`);
    console.error('  Verificá que MySQL/MariaDB esté corriendo (XAMPP → Start MySQL) y los datos DB_* / DATABASE_URL.\n');
    if (config.db.ssl === undefined && config.isProduction) console.error('  En la nube casi siempre hace falta DB_SSL=true.\n');
    process.exit(1);
  }

  // Primera ejecución: si no hay usuarios, carga los datos iniciales según APP_MODE.
  const { c } = await sql.get('SELECT COUNT(*) AS c FROM usuarios');
  if (Number(c) === 0) {
    console.log(`• Base vacía: inicializando en modo ${config.appMode.toUpperCase()}...`);
    await seedInicial();
  }

  const app = createApp();
  const server = http.createServer(app);

  // WebSocket nativo en el mismo puerto (ws://host:PORT/ws), autenticado con la cookie de sesión.
  // Los celulares de clientes se identifican con la cookie de seguimiento (solo ven su pedido).
  initRealtime(server, { authenticate: readSession, seguimiento: readSeguimiento });

  server.listen(config.port, () => {
    console.log(`\n🍔 AutoPedido 2.0 listo en http://localhost:${config.port}  [modo ${config.appMode}]`);
    console.log(`   WebSocket: ws://localhost:${config.port}/ws`);
    console.log(`   Pantalla de llamados (pública): http://localhost:${config.port}/llamados`);
    console.log(`   Seguimiento desde celulares (QR): ${publicBaseUrl(config)}/seguimiento\n`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} recibido, cerrando...`);
    closeRealtime();
    server.close();
    await closeDatabase().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
