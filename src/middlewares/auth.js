import config from '../config/index.js';
import { usuariosRepo } from '../repositories/catalogo.repositories.js';
import { HOME_BY_ROLE, SUPERADMIN } from '../services/auth.service.js';
import { licenciaBloqueada, moduloActivo, rolHabilitado } from '../services/config.service.js';
import { HttpError, forbidden, unauthorized } from '../utils/http-error.js';
import { parseCookies, verifyToken } from '../utils/token.js';

export const SESSION_COOKIE = 'ap_session';
export const SEGUIMIENTO_COOKIE = 'ap_seguimiento';
export const MESA_COOKIE = 'ap_mesa';

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: config.sessionHours * 3600 * 1000,
  };
}

/** Lee la sesión del personal (cookie firmada) de una request HTTP o de un upgrade WebSocket. */
export function readSession(req) {
  const payload = verifyToken(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  // Un token de otro tipo (p. ej. de seguimiento) nunca vale como sesión.
  return payload && !payload.typ ? payload : null;
}

/** Id del pedido que sigue un cliente desde su celular (o null). */
export function readSeguimiento(req) {
  const payload = verifyToken(parseCookies(req.headers.cookie)[SEGUIMIENTO_COOKIE]);
  return payload?.typ === 'seguimiento' && Number.isInteger(payload.pid) ? payload.pid : null;
}

/** Id de la mesa abierta a la que entró el celular con su código (o null). Si la mesa se libera, deja de valer. */
export function readMesaAcceso(req) {
  const payload = verifyToken(parseCookies(req.headers.cookie)[MESA_COOKIE]);
  return payload?.typ === 'mesa' && Number.isInteger(payload.aid) ? payload.aid : null;
}

export function seguimientoCookieOptions(horas) {
  return { httpOnly: true, sameSite: 'lax', secure: config.isProduction, path: '/', maxAge: horas * 3600 * 1000 };
}

/**
 * Carga `req.user` si hay sesión válida y el usuario sigue activo en la base.
 * (Si un admin deshabilita a alguien, pierde el acceso al instante.)
 * Si el paquete deja de incluir su rol, la sesión también deja de valer.
 * El superadmin no está en la base: vale mientras sus variables de entorno sigan definidas.
 */
export async function loadUser(req, _res, next) {
  const session = readSession(req);
  if (session?.sa) {
    if (config.superadmin && session.rol === 'Superadmin' && session.id === 0) req.user = { ...SUPERADMIN };
  } else if (session) {
    const user = await usuariosRepo.findById(session.id);
    if (user?.activo && user.rol === session.rol && rolHabilitado(user.rol)) req.user = { id: user.id, nombre: user.nombre, rol: user.rol };
  }
  if (!req.user) {
    req.seguimientoId = readSeguimiento(req);
    req.mesaAccesoId = readMesaAcceso(req);
  }
  next();
}

/**
 * Un celular que está siguiendo su pedido (y no tiene sesión del personal)
 * solo puede ver /seguimiento: cualquier otra página lo devuelve ahí.
 */
export function seguimientoLock(req, res, next) {
  if (!req.user && req.seguimientoId && req.path !== '/seguimiento' && !req.path.startsWith('/mesa/')) return res.redirect('/seguimiento');
  next();
}

/** Administrador del negocio o superadmin (que puede entrar a todo para dar soporte). */
const esAdmin = (user) => user.rol === 'Administrador' || user.rol === 'Superadmin';

/**
 * Las secciones de roles que el paquete no incluye (ej. caja y mozo en Tótem) quedan cerradas
 * también para el administrador; el superadmin entra igual. La cocina siempre existe: en un
 * Tótem sin usuario de cocina, la atiende el administrador.
 */
const seccionHabilitada = (user, roles) =>
  user.rol === 'Superadmin' || !roles.length || roles.includes('Cocina') || roles.some((r) => rolHabilitado(r));

/** Exige sesión y (opcionalmente) alguno de los roles. El Administrador tiene acceso a todo. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (roles.length && !esAdmin(req.user) && !roles.includes(req.user.rol)) return next(forbidden());
    if (!seccionHabilitada(req.user, roles)) return next(forbidden('El paquete contratado no incluye esta sección.'));
    next();
  };
}

const NOMBRE_MODULO = { cupones: 'cupones de descuento', puntos: 'puntos de clientes', seguimiento: 'seguimiento por QR', estadisticas: 'estadísticas' };

/** Endpoint de un módulo que el superadmin puede apagar. */
export const requireModulo = (modulo) => (req, _res, next) =>
  moduloActivo(modulo) || req.user?.rol === 'Superadmin' ? next() : next(forbidden(`El paquete contratado no incluye ${NOMBRE_MODULO[modulo] || modulo}.`));

/** Solo el superadmin. */
export function requireSuperadmin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.rol !== 'Superadmin') return next(forbidden());
  next();
}

/**
 * Protege las páginas HTML: sin sesión → /login; rol incorrecto → su pantalla de inicio.
 */
export function pageGuard(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    if (!esAdmin(req.user) && !roles.includes(req.user.rol)) return res.redirect(HOME_BY_ROLE[req.user.rol] || '/login');
    if (!seccionHabilitada(req.user, roles)) return res.redirect(HOME_BY_ROLE[req.user.rol] || '/login');
    next();
  };
}

/**
 * Página solo para el superadmin; a cualquier otro (aunque no tenga sesión) le responde 404,
 * así nadie sabe que existe. El superadmin entra por el login normal y va directo ahí.
 */
export function superadminPage(req, _res, next) {
  next(req.user?.rol === 'Superadmin' ? undefined : 'route');
}

/**
 * Licencia vencida o suspendida: se corta todo salvo el login, la salud del servicio, la marca y
 * el superadmin. La API responde 423 y las páginas muestran "Servicio suspendido".
 */
const LIBRES_API = [/^\/api\/auth\//, /^\/api\/health$/, /^\/api\/salud$/, /^\/api\/publico\/negocio$/, /^\/api\/superadmin(\/|$)/];
const LIBRES_PAGINAS = [/^\/login$/, /^\/suspendido$/, /^\/superadmin$/, /^\/negocio\/logo$/, /^\/(css|js|img|vendor|sounds|uploads)\//, /^\/favicon/];

export function licenciaGuard(req, res, next) {
  if (req.user?.rol === 'Superadmin' || !licenciaBloqueada()) return next();
  const ruta = req.path;
  if (ruta.startsWith('/api/')) {
    if (LIBRES_API.some((r) => r.test(ruta))) return next();
    return next(new HttpError(423, 'El servicio está suspendido. Comunicate con el proveedor del sistema.'));
  }
  if (LIBRES_PAGINAS.some((r) => r.test(ruta))) return next();
  return res.redirect('/suspendido');
}
