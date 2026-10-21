import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Carga nativa del .env (Node >= 21.7), sin dependencias externas.
// En la nube (Render, etc.) no hay .env: las variables vienen del panel del servicio.
const envFile = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const env = process.env;
const isProduction = env.NODE_ENV === 'production';
const bool = (v) => ['1', 'true', 'si', 'sí', 'yes'].includes(String(v ?? '').trim().toLowerCase());

if (isProduction && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)) {
  throw new Error('En producción SESSION_SECRET debe tener al menos 32 caracteres.');
}
if (env.SUPERADMIN_PASSWORD && env.SUPERADMIN_PASSWORD.length < 6) {
  throw new Error('SUPERADMIN_PASSWORD debe tener al menos 6 caracteres.');
}

/**
 * Modo de la app:
 *  - demo:       la primera vez carga datos de prueba (productos con imágenes, usuarios, clientes, promos).
 *  - produccion: la primera vez deja todo vacío y crea solo el administrador (ADMIN_USER / ADMIN_PASSWORD).
 */
const APP_MODES = ['demo', 'produccion'];
const appMode = String(env.APP_MODE || 'demo').trim().toLowerCase().replace('producción', 'produccion');
if (!APP_MODES.includes(appMode)) {
  throw new Error(`APP_MODE inválido: "${env.APP_MODE}". Valores posibles: ${APP_MODES.join(', ')}.`);
}

/** Conexión: DATABASE_URL (mysql://usuario:clave@host:puerto/base) o las variables DB_* sueltas. */
function dbConfig() {
  const base = {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'autopedido',
  };
  let sslDesdeUrl = false;
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    Object.assign(base, {
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')) || base.database,
    });
    const sslParam = (url.searchParams.get('ssl') ?? url.searchParams.get('ssl-mode') ?? '').toLowerCase();
    sslDesdeUrl = ['true', 'required', 'verify_ca', 'verify_identity'].includes(sslParam);
  }
  const ssl = bool(env.DB_SSL) || sslDesdeUrl;
  return {
    ...base,
    connectionLimit: Number(env.DB_POOL) || 10,
    // La mayoría de los MySQL en la nube exigen conexión cifrada.
    ssl: ssl ? { rejectUnauthorized: !bool(env.DB_SSL_ALLOW_SELF_SIGNED), minVersion: 'TLSv1.2' } : undefined,
  };
}

const config = Object.freeze({
  env: env.NODE_ENV || 'development',
  isProduction,
  appMode,
  isDemo: appMode === 'demo',
  port: Number(env.PORT) || 3000,
  sessionSecret: env.SESSION_SECRET || 'autopedido-dev-secret-no-usar-en-produccion',
  sessionHours: Number(env.SESSION_HOURS) || 12,
  timezone: env.APP_TIMEZONE || 'America/Montevideo',
  db: dbConfig(),
  // Administrador inicial del modo producción.
  admin: {
    user: env.ADMIN_USER || 'Admin',
    password: env.ADMIN_PASSWORD || '',
  },
  // Detrás de un proxy (Render, Railway, Nginx...) poner TRUST_PROXY=1 para ver la IP real del cliente.
  trustProxy: env.TRUST_PROXY ? (Number.isNaN(Number(env.TRUST_PROXY)) ? env.TRUST_PROXY : Number(env.TRUST_PROXY)) : 'loopback',
  // URL con la que los celulares llegan al servidor (QR de seguimiento). Vacío = se detecta la IP local.
  // En Render se toma sola de RENDER_EXTERNAL_URL.
  publicUrl: env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '',
  kioscoPin: env.KIOSCO_PIN || '4500',
  // Superadmin oculto (solo el proveedor de la app): no se guarda en la base. Sin estas variables no existe.
  superadmin: env.SUPERADMIN_USER && env.SUPERADMIN_PASSWORD ? { user: env.SUPERADMIN_USER.trim(), password: env.SUPERADMIN_PASSWORD } : null,
  // Clave compartida entre todas tus instalaciones para el panel central (vacía = no se puede consultar desde otra).
  superadminApiKey: env.SUPERADMIN_API_KEY && env.SUPERADMIN_API_KEY.length >= 24 ? env.SUPERADMIN_API_KEY : null,
  // Versión desplegada (Render la pone sola) para verla en el panel central.
  version: (env.RENDER_GIT_COMMIT || '').slice(0, 7) || null,
  productPlaceholder: env.PRODUCT_PLACEHOLDER || '/img/placeholder-producto.svg',
  paths: {
    public: path.join(ROOT_DIR, 'public'),
    uploads: path.join(ROOT_DIR, 'uploads'),
    nodeModules: path.join(ROOT_DIR, 'node_modules'),
  },
});

export default config;
