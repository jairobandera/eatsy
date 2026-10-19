import config from '../config/index.js';
import { usuariosRepo } from '../repositories/catalogo.repositories.js';
import { HOME_BY_ROLE } from '../services/auth.service.js';
import { forbidden, unauthorized } from '../utils/http-error.js';
import { parseCookies, verifyToken } from '../utils/token.js';

export const SESSION_COOKIE = 'ap_session';
export const SEGUIMIENTO_COOKIE = 'ap_seguimiento';

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

export function seguimientoCookieOptions(horas) {
  return { httpOnly: true, sameSite: 'lax', secure: config.isProduction, path: '/', maxAge: horas * 3600 * 1000 };
}

/**
 * Carga `req.user` si hay sesión válida y el usuario sigue activo en la base.
 * (Si un admin deshabilita a alguien, pierde el acceso al instante.)
 */
export async function loadUser(req, _res, next) {
  const session = readSession(req);
  if (session) {
    const user = await usuariosRepo.findById(session.id);
    if (user?.activo && user.rol === session.rol) req.user = { id: user.id, nombre: user.nombre, rol: user.rol };
  }
  if (!req.user) req.seguimientoId = readSeguimiento(req);
  next();
}

/**
 * Un celular que está siguiendo su pedido (y no tiene sesión del personal)
 * solo puede ver /seguimiento: cualquier otra página lo devuelve ahí.
 */
export function seguimientoLock(req, res, next) {
  if (!req.user && req.seguimientoId && req.path !== '/seguimiento') return res.redirect('/seguimiento');
  next();
}

/** Exige sesión y (opcionalmente) alguno de los roles. El Administrador tiene acceso a todo. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (roles.length && req.user.rol !== 'Administrador' && !roles.includes(req.user.rol)) return next(forbidden());
    next();
  };
}

/**
 * Protege las páginas HTML: sin sesión → /login; rol incorrecto → su pantalla de inicio.
 */
export function pageGuard(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    if (req.user.rol !== 'Administrador' && !roles.includes(req.user.rol)) return res.redirect(HOME_BY_ROLE[req.user.rol] || '/login');
    next();
  };
}
