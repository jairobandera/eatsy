import { forbidden } from '../utils/http-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF: toda petición que modifica datos debe traer la cabecera
 * `X-Requested-With: fetch` (un formulario de otro sitio no puede agregarla).
 * Se combina con la cookie SameSite=Lax.
 */
export function csrfGuard(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('x-requested-with') !== 'fetch') return next(forbidden('Petición rechazada (falta cabecera de seguridad).'));
  next();
}

/** Cabeceras de seguridad básicas (sin dependencias como helmet). */
export function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
  });
  // COOP solo tiene efecto (y solo se acepta sin advertencias) en HTTPS.
  if (req.secure) res.set('Cross-Origin-Opener-Policy', 'same-origin');
  next();
}
