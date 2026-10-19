import crypto from 'node:crypto';
import config from '../config/index.js';
import { usuariosRepo } from '../repositories/catalogo.repositories.js';
import { forbidden, unauthorized } from '../utils/http-error.js';
import { verifyPassword } from '../utils/password.js';
import { createRateLimiter } from '../utils/rate-limit.js';
import { createToken } from '../utils/token.js';

/** Pantalla de inicio según el rol. */
export const HOME_BY_ROLE = {
  Administrador: '/admin',
  Cajero: '/caja',
  Cocina: '/cocina',
  Cliente: '/kiosco',
};

// Freno contra fuerza bruta: 5 intentos fallidos por usuario+IP cada 5 minutos.
const loginLimiter = createRateLimiter({ max: 5, windowMs: 5 * 60 * 1000 });

export async function login({ nombre, contrasena, ip }) {
  const key = `${nombre.toLowerCase()}|${ip}`;
  if (loginLimiter.blocked(key)) throw forbidden('Demasiados intentos fallidos. Esperá unos minutos e intentá de nuevo.');

  const user = await usuariosRepo.findForLogin(nombre);
  if (!user || !verifyPassword(contrasena, user.contrasena)) {
    loginLimiter.hit(key);
    throw unauthorized('Usuario o contraseña incorrectos.');
  }
  if (!user.activo) throw forbidden('El usuario está deshabilitado.');

  loginLimiter.reset(key);
  const publicUser = { id: user.id, nombre: user.nombre, rol: user.rol };
  return { user: publicUser, token: createToken(publicUser), home: HOME_BY_ROLE[user.rol] };
}

/** Comparación en tiempo constante del PIN del kiosco. */
export function verificarPinKiosco(pin) {
  const a = Buffer.from(String(pin ?? ''));
  const b = Buffer.from(config.kioscoPin);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
