import http from 'node:http';
import { createApp } from './src/app.js';
import config from './src/config/index.js';
import { closeDatabase, iniciarLatido, initDatabase, sql } from './src/db/connection.js';
import { seedInicial } from './src/db/seed.js';
import { readMesaAcceso, readSeguimiento, readSession } from './src/middlewares/auth.js';
import { cargarConfig } from './src/services/config.service.js';
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

  // Paquete, licencia, marca, límites y módulos de esta instalación (los define el superadmin).
  const cfg = await cargarConfig();
  console.log(`• Paquete ${cfg.paquete.tipo.toUpperCase()} · ${cfg.negocio.nombre}${config.superadmin ? ' · superadmin habilitado' : ''}`);

  // Mantiene activa la base (los MySQL gratuitos en la nube se apagan si no tienen actividad).
  iniciarLatido();

  const app = createApp();
  const server = http.createServer(app);

  // WebSocket nativo en el mismo puerto (ws://host:PORT/ws), autenticado con la cookie de sesión.
  // Los celulares de clientes se identifican con la cookie de seguimiento (solo ven su pedido)
  // o, en una mesa, con la cookie que obtienen con el código de la mesa (solo ven los pedidos de esa mesa).
  initRealtime(server, { authenticate: readSession, seguimiento: readSeguimiento, mesa: readMesaAcceso });

  server.listen(config.port, () => {
    // En la nube (PUBLIC_URL / RENDER_EXTERNAL_URL) mostramos la URL pública; en el local, localhost.
    const base = config.publicUrl ? publicBaseUrl(config) : `http://localhost:${config.port}`;
    console.log(`\n🍔 AutoPedido 2.0 listo en ${base}  [modo ${config.appMode}]`);
    console.log(`   WebSocket: ${base.replace(/^http/, 'ws')}/ws`);
    console.log(`   Pantalla de llamados (pública): ${base}/llamados`);
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
