import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Carga nativa del .env (Node >= 21.7), sin dependencias externas.
const envFile = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

if (isProduction && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)) {
  throw new Error('En producción SESSION_SECRET debe tener al menos 32 caracteres.');
}

const config = Object.freeze({
  env: env.NODE_ENV || 'development',
  isProduction,
  port: Number(env.PORT) || 3000,
  sessionSecret: env.SESSION_SECRET || 'autopedido-dev-secret-no-usar-en-produccion',
  sessionHours: Number(env.SESSION_HOURS) || 12,
  timezone: env.APP_TIMEZONE || 'America/Montevideo',
  db: {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'autopedido',
    connectionLimit: Number(env.DB_POOL) || 10,
  },
  // URL con la que los celulares llegan al servidor (QR de seguimiento). Vacío = se detecta la IP local.
  publicUrl: env.PUBLIC_URL || '',
  kioscoPin: env.KIOSCO_PIN || '4500',
  productPlaceholder: env.PRODUCT_PLACEHOLDER || '/img/placeholder-producto.svg',
  paths: {
    public: path.join(ROOT_DIR, 'public'),
    uploads: path.join(ROOT_DIR, 'uploads'),
    nodeModules: path.join(ROOT_DIR, 'node_modules'),
  },
});

export default config;
