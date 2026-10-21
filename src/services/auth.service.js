import crypto from 'node:crypto';
import config from '../config/index.js';
import { usuariosRepo } from '../repositories/catalogo.repositories.js';
import { HttpError, forbidden, unauthorized } from '../utils/http-error.js';
import { licenciaBloqueada, rolHabilitado } from './config.service.js';
import { verifyPassword } from '../utils/password.js';
import { createRateLimiter } from '../utils/rate-limit.js';
import { createToken } from '../utils/token.js';

/** Pantalla de inicio según el rol. */
export const HOME_BY_ROLE = {
  Administrador: '/admin',
  Cajero: '/caja',
  Cocina: '/cocina',
  Cliente: '/kiosco',
  Mozo: '/mozo',
  Superadmin: '/superadmin',
};

/** Nombre visible de cada rol (para mensajes). */
export const ROL_LABEL = { Administrador: 'Administrador', Cajero: 'Cajero', Cocina: 'Cocina', Mozo: 'Mozo', Cliente: 'Kiosco' };

// Freno contra fuerza bruta: 5 intentos fallidos por usuario+IP cada 5 minutos.
const loginLimiter = createRateLimiter({ max: 5, windowMs: 5 * 60 * 1000 });

const igualSeguro = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

/** Usuario del superadmin oculto (definido por variables de entorno, nunca en la base). */
export const SUPERADMIN = Object.freeze({ id: 0, nombre: 'Superadmin', rol: 'Superadmin' });
export const esSuperadmin = (nombre) => Boolean(config.superadmin) && String(nombre).trim().toLowerCase() === config.superadmin.user.toLowerCase();

export async function login({ nombre, contrasena, ip }) {
  const key = `${nombre.toLowerCase()}|${ip}`;
  if (loginLimiter.blocked(key)) throw forbidden('Demasiados intentos fallidos. Esperá unos minutos e intentá de nuevo.');

  // Superadmin: se valida contra el entorno y no se consulta la base.
  if (esSuperadmin(nombre)) {
    if (!igualSeguro(contrasena, config.superadmin.password)) {
      loginLimiter.hit(key);
      throw unauthorized('Usuario o contraseña incorrectos.');
    }
    loginLimiter.reset(key);
    return { user: SUPERADMIN, token: createToken({ ...SUPERADMIN, sa: true }), home: HOME_BY_ROLE.Superadmin };
  }

  const user = await usuariosRepo.findForLogin(nombre);
  if (!user || !verifyPassword(contrasena, user.contrasena)) {
    loginLimiter.hit(key);
    throw unauthorized('Usuario o contraseña incorrectos.');
  }
  if (!user.activo) throw forbidden('El usuario está deshabilitado.');
  if (licenciaBloqueada()) throw new HttpError(423, 'El servicio está suspendido. Comunicate con el proveedor del sistema.');
  if (!rolHabilitado(user.rol)) throw forbidden(`El paquete contratado no incluye el acceso de ${ROL_LABEL[user.rol] || user.rol}.`);

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
