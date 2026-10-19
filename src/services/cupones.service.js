import { promocionesRepo } from '../repositories/promociones.repository.js';
import { today } from '../utils/dates.js';
import { forbidden, unprocessable } from '../utils/http-error.js';
import { createRateLimiter } from '../utils/rate-limit.js';
import { round2 } from './pricing.service.js';

/**
 * Cupones = promociones de MONTO FIJO con código.
 * No se aplican solas: el cliente ingresa el código en el kiosco o el cajero en la caja,
 * y se descuenta el monto del TOTAL del pedido (una vez por pedido), siempre que el
 * pedido incluya al menos un producto de la promoción. El descuento nunca supera
 * lo que suman esos productos.
 */

// Freno contra prueba de códigos al azar: 15 códigos inválidos por IP cada 10 minutos.
const limiter = createRateLimiter({ max: 15, windowMs: 10 * 60 * 1000 });

export const normalizarCupon = (codigo) => String(codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Busca un cupón vigente. Lanza 422 si no existe o venció. */
export async function buscarCupon(codigo, { ip } = {}) {
  const key = ip || 'sin-ip';
  if (limiter.blocked(key)) throw forbidden('Demasiados códigos inválidos. Esperá unos minutos.');
  const cod = normalizarCupon(codigo);
  const cupon = cod ? await promocionesRepo.findCuponVigente(cod, today()) : null;
  if (!cupon) {
    limiter.hit(key);
    throw unprocessable('El código ingresado no es válido o ya venció.', { cupon_invalido: true });
  }
  return cupon;
}

/** Datos públicos del cupón (para mostrar en kiosco/caja antes de confirmar). */
export const cuponPublico = (c) => ({ codigo: c.codigo, nombre: c.nombre, descuento: Number(c.descuento), productos: c.productos });

/**
 * Calcula el descuento del cupón sobre las líneas del pedido.
 * @param {{productos:number[], descuento:number, nombre:string}} cupon
 * @param {{producto_id:number, subtotal:number}[]} lineas
 */
export function descuentoCupon(cupon, lineas) {
  const elegibles = new Set(cupon.productos);
  const base = lineas.filter((l) => elegibles.has(l.producto_id)).reduce((s, l) => s + l.subtotal, 0);
  if (base <= 0) throw unprocessable(`El cupón "${cupon.codigo}" no aplica a los productos de este pedido.`, { cupon_invalido: true });
  return round2(Math.min(Number(cupon.descuento), base));
}
