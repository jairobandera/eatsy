import path from 'node:path';
import express from 'express';
import config from './config/index.js';
import { loadUser } from './middlewares/auth.js';
import { errorHandler } from './middlewares/error-handler.js';
import { securityHeaders } from './middlewares/security.js';
import apiRoutes from './routes/api.routes.js';
import pageRoutes from './routes/pages.routes.js';

/** Librerías del frontend servidas desde node_modules (funciona sin internet). */
const VENDOR = {
  bootstrap: 'bootstrap/dist',
  'bootstrap-icons': 'bootstrap-icons/font',
  sweetalert2: 'sweetalert2/dist',
  chartjs: 'chart.js/dist',
  jsbarcode: 'jsbarcode/dist',
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(securityHeaders);

  const staticOpts = { index: false, redirect: false, maxAge: config.isProduction ? '7d' : 0 };

  // Archivos estáticos (sin exponer los .html directamente: pasan por pages.routes).
  app.use((req, res, next) => (req.path.endsWith('.html') ? res.status(404).end() : next()));
  app.use(express.static(config.paths.public, staticOpts));
  app.use('/uploads', express.static(config.paths.uploads, staticOpts));
  for (const [name, dir] of Object.entries(VENDOR)) {
    app.use(`/vendor/${name}`, express.static(path.join(config.paths.nodeModules, dir), { ...staticOpts, maxAge: '30d' }));
  }

  app.use(loadUser);
  app.use('/api', apiRoutes);
  app.use(pageRoutes);

  app.use((req, res) => res.status(404).sendFile(path.join(config.paths.public, '404.html')));
  app.use(errorHandler);

  return app;
}
