import { SESSION_COOKIE, sessionCookieOptions } from '../middlewares/auth.js';
import { HOME_BY_ROLE, login, verificarPinKiosco } from '../services/auth.service.js';
import { forbidden, unauthorized } from '../utils/http-error.js';
import { validate } from '../utils/validator.js';

export async function postLogin(req, res) {
  const data = validate(req.body, {
    nombre: { type: 'string', required: true, maxLength: 100, label: 'usuario' },
    contrasena: { type: 'string', required: true, maxLength: 200, label: 'contraseña' },
  });
  const { user, token, home } = await login({ ...data, ip: req.ip });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.json({ user, home });
}

/** Cierra la sesión. En el kiosco (rol Cliente) exige el PIN del local. */
export function postLogout(req, res) {
  if (req.user?.rol === 'Cliente' && !verificarPinKiosco(req.body?.pin)) {
    throw forbidden('PIN incorrecto.');
  }
  const { maxAge, ...opts } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE, opts);
  res.json({ ok: true });
}

export function getMe(req, res) {
  if (!req.user) throw unauthorized();
  res.json({ user: req.user, home: HOME_BY_ROLE[req.user.rol] });
}
