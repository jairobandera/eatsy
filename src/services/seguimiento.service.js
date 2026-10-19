import { pedidosRepo } from '../repositories/pedidos.repository.js';
import { today } from '../utils/dates.js';
import { forbidden, notFound, unprocessable } from '../utils/http-error.js';
import { createRateLimiter } from '../utils/rate-limit.js';
import { createToken } from '../utils/token.js';

/**
 * Seguimiento de pedidos desde el celular del cliente (escaneando el QR de la pantalla de llamados).
 * El cliente se identifica con el código del pedido y, si el pedido tiene un cliente
 * asociado, también con su cédula. Recibe un token firmado que solo le permite ver ESE pedido.
 */
export const SEGUIMIENTO_HORAS = 12;

// Máx. 10 búsquedas fallidas por IP cada 10 minutos (evita adivinar códigos).
const limiter = createRateLimiter({ max: 10, windowMs: 10 * 60 * 1000 });

const limpiarCedula = (c) => String(c ?? '').replace(/\D/g, '');

/** Acepta "PED-AB12", "ped ab12" o solo "AB12". */
export function normalizarCodigo(input) {
  const raw = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sinPrefijo = raw.startsWith('PED') && raw.length > 4 ? raw.slice(3) : raw;
  return `PED-${sinPrefijo}`;
}

/** Datos que ve el cliente en su celular: sin montos de pago, sin cédula, sin datos de personal. */
export function toSeguimientoDto(p) {
  return {
    id: p.id,
    codigo: p.codigo,
    estado: p.estado,
    origen: p.origen,
    total: p.total,
    created_at: p.created_at,
    updated_at: p.updated_at,
    cliente: p.cliente ? { nombre: p.cliente.nombre } : null,
    detalles: (p.detalles || []).map((d) => ({
      cantidad: d.cantidad,
      nombre: d.producto.nombre,
      quitados: d.quitados.map((q) => q.nombre),
      extras: (d.extras || []).map((e) => ({ nombre: e.nombre, cantidad: e.cantidad })),
    })),
  };
}

const CERRADOS = ['Entregado', 'Cancelado'];

/** Solo se pueden seguir pedidos de hoy o que todavía estén en curso. */
const seguible = (p) => p.created_at.slice(0, 10) === today() || !CERRADOS.includes(p.estado);

export async function iniciarSeguimiento({ codigo, cedula, ip }) {
  if (limiter.blocked(ip)) throw forbidden('Demasiados intentos. Esperá unos minutos y volvé a probar.');

  const fallar = () => {
    limiter.hit(ip);
    return notFound('No encontramos un pedido de hoy con esos datos. Revisá el código de tu ticket.');
  };

  const id = await pedidosRepo.findIdByCodigo(normalizarCodigo(codigo));
  const pedido = id ? await pedidosRepo.findById(id) : null;
  if (!pedido || !seguible(pedido)) throw fallar();

  if (pedido.cliente) {
    const ci = limpiarCedula(cedula);
    if (!ci) throw unprocessable('Este pedido está a nombre de un cliente: ingresá tu cédula para verlo.', { requiere_cedula: true });
    if (ci !== limpiarCedula(pedido.cliente.cedula)) throw fallar();
  }

  limiter.reset(ip);
  const token = createToken({ typ: 'seguimiento', pid: pedido.id }, SEGUIMIENTO_HORAS * 3600);
  return { token, pedido: toSeguimientoDto(pedido) };
}

export async function obtenerSeguimiento(pedidoId) {
  const pedido = await pedidosRepo.findById(pedidoId);
  if (!pedido) throw notFound('El pedido ya no está disponible.');
  return toSeguimientoDto(pedido);
}
