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

/** Decodifica %XX de la URL; si la clave tiene un "%" suelto (ej. "ab%tu") se usa tal cual. */
const decodificar = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * Parte postgresql://usuario:clave@host:puerto/base?params a mano (no con `new URL`): así la clave
 * puede tener @, #, ? o % sin escapar, como las que genera Supabase.
 */
export function parsearDatabaseUrl(texto) {
  const m = String(texto).trim().match(/^postgres(?:ql)?:\/\/([^:@/]*)(?::(.*))?@([^@/?#:]+|\[[^\]]+\])(?::(\d+))?(?:\/([^?#]*))?(?:\?([^#]*))?$/i);
  if (!m) throw new Error('DATABASE_URL inválida. Formato: postgresql://usuario:clave@host:puerto/base');
  const [, user, password = '', host, port, database, query = ''] = m;
  return {
    host,
    port: Number(port) || 5432,
    user: decodificar(user),
    password: decodificar(password),
    database: decodificar(database || '') || 'postgres',
    params: new URLSearchParams(query),
  };
}

// Esquemas de Supabase / PostgreSQL que la app nunca debe usar (ni borrar con db:reset).
const ESQUEMAS_RESERVADOS = ['public', 'auth', 'storage', 'realtime', 'extensions', 'graphql', 'graphql_public', 'pgbouncer', 'vault', 'supabase_migrations', 'supabase_functions', 'information_schema'];

/**
 * Conexión PostgreSQL: DATABASE_URL (postgresql://usuario:clave@host:puerto/base) o las variables
 * DB_* sueltas. Las tablas van en el esquema DB_SCHEMA (por defecto "eatsy").
 */
function dbConfig() {
  const base = {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT) || 5432,
    user: env.DB_USER || 'postgres',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'postgres',
  };
  let sslDesdeUrl = false;
  if (env.DATABASE_URL) {
    const { params, ...url } = parsearDatabaseUrl(env.DATABASE_URL);
    Object.assign(base, url);
    sslDesdeUrl = ['require', 'verify-ca', 'verify-full', 'true'].includes((params.get('sslmode') ?? params.get('ssl') ?? '').toLowerCase());
  }
  const supabase = /\.supabase\.(co|com)$/i.test(base.host);
  // El pooler de Supabase en modo "transaction" (6543) no conserva el search_path entre consultas:
  // se usa el modo "session" (5432) del mismo host.
  if (supabase && base.port === 6543) {
    console.warn('[db] Supabase: se usa el puerto 5432 (session pooler) en lugar de 6543 (transaction pooler).');
    base.port = 5432;
  }
  const schema = String(env.DB_SCHEMA || 'eatsy').trim().toLowerCase();
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema) || schema.startsWith('pg_') || ESQUEMAS_RESERVADOS.includes(schema)) {
    throw new Error(`DB_SCHEMA inválido: "${schema}". Usá un esquema propio de la app, ej. eatsy.`);
  }
  const ssl = bool(env.DB_SSL) || sslDesdeUrl || supabase;
  return {
    ...base,
    schema,
    // Pocas conexiones: en Supabase gratis el límite (≈60) se comparte con los otros proyectos.
    connectionLimit: Number(env.DB_POOL) || 5,
    // Consulta a la base cada N minutos para que no se pause por inactividad (0 = no).
    keepaliveMs: (env.DB_KEEPALIVE_MINUTOS === undefined || env.DB_KEEPALIVE_MINUTOS === '' ? 60 : Math.max(0, Number(env.DB_KEEPALIVE_MINUTOS) || 0)) * 60_000,
    // Supabase cifra con su propia autoridad certificante: por defecto se cifra sin verificarla
    // (DB_SSL_VERIFY=true para exigirla, ej. con NODE_EXTRA_CA_CERTS apuntando al certificado).
    ssl: ssl ? { rejectUnauthorized: bool(env.DB_SSL_VERIFY) } : undefined,
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
