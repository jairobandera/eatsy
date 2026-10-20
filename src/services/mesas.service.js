import crypto from 'node:crypto';
import QRCode from 'qrcode';
import config from '../config/index.js';
import { usuariosRepo } from '../repositories/catalogo.repositories.js';
import { now } from '../utils/dates.js';
import { HttpError, conflict, forbidden, notFound } from '../utils/http-error.js';
import { publicBaseUrl } from '../utils/network.js';
import { createRateLimiter } from '../utils/rate-limit.js';
import { publish } from '../websocket/realtime.js';
import { mesasRepo } from '../repositories/mesas.repository.js';
import { createToken } from '../utils/token.js';
import { listarMesas } from './pedidos.service.js';
import { toMesaDto } from './seguimiento.service.js';

/**
 * Mesas atendidas por mozos. Cada mozo tiene un QR propio (se imprime y se pone en sus mesas):
 * el cliente lo escanea, indica su número de mesa y el código que le da el mozo, ve el estado de
 * sus pedidos y puede llamar al mozo.
 * El QR lleva un token al azar (no el id del usuario) para que no se pueda adivinar el de otro mozo.
 */
export const nuevoQrToken = () => crypto.randomBytes(12).toString('base64url');

export const urlMesa = (token) => `${publicBaseUrl(config)}/mesa/${token}`;

async function mozoDelQr(token) {
  const mozo = await usuariosRepo.findMozoByQrToken(token);
  if (!mozo) throw notFound('Este código QR ya no está disponible. Pedile ayuda a un mozo.');
  return mozo;
}

export async function infoQr(token) {
  const mozo = await mozoDelQr(token);
  return { mozo: { nombre: mozo.nombre } };
}

// ───────────── Acceso del celular a una mesa (QR del mozo + código de la mesa) ─────────────
export const MESA_ACCESO_HORAS = 12;

// Frenos contra adivinar códigos: 15 fallos por mesa cada 10 minutos (con 4 dígitos, adivinar llevaría
// días y la mesa se cierra antes) y 30 por IP (holgado: los celulares del Wi-Fi del local comparten IP).
const fallosIp = createRateLimiter({ max: 30, windowMs: 10 * 60_000 });
const fallosMesa = createRateLimiter({ max: 15, windowMs: 10 * 60_000 });

/** Comparación en tiempo constante del código de la mesa. */
export function codigoCorrecto(ingresado, real) {
  const a = Buffer.from(String(ingresado ?? '').replace(/\D/g, ''));
  const b = Buffer.from(String(real));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * El cliente indica su mesa y el código que le dio el mozo. Si es correcto recibe un token
 * que solo sirve para ESA apertura de la mesa: al liberarla deja de valer (desde casa no sirve).
 */
export async function ingresarMesa({ token, numero, codigo, ip }) {
  if (fallosIp.blocked(ip)) throw forbidden('Demasiados intentos. Esperá unos minutos o pedile ayuda al mozo.');
  const mozo = await mozoDelQr(token);
  const claveMesa = `${mozo.id}:${numero}`;
  if (fallosMesa.blocked(claveMesa)) throw forbidden('Esta mesa tuvo demasiados intentos. Pedile el código al mozo.');

  const apertura = await mesasRepo.findAbiertaPorNumero(numero);
  if (!apertura || apertura.mozo.id !== mozo.id || !codigoCorrecto(codigo, apertura.codigo)) {
    fallosIp.hit(ip);
    fallosMesa.hit(claveMesa);
    throw notFound('La mesa o el código no coinciden. Pedile el código de la mesa a tu mozo.');
  }
  fallosIp.reset(ip);
  return { acceso: createToken({ typ: 'mesa', aid: apertura.id }, MESA_ACCESO_HORAS * 3600), mesa: await pedidosDeMesa(apertura.id) };
}

async function aperturaVigente(aperturaId) {
  const apertura = aperturaId ? await mesasRepo.findById(aperturaId) : null;
  if (!apertura?.abierta) throw new HttpError(410, 'La mesa ya se cerró. ¡Gracias por venir!');
  return apertura;
}

/** Pedidos de la mesa a la que entró este celular. */
export async function pedidosDeMesa(aperturaId) {
  const apertura = await aperturaVigente(aperturaId);
  const [mesa] = await listarMesas({ aperturas: [apertura] });
  return { mozo: { nombre: apertura.mozo.nombre }, mesa: apertura.numero, pedidos: mesa.pedidos.map(toMesaDto), total: mesa.total, pendiente: mesa.pendiente };
}

// Un llamado por mesa cada 45 s (el mozo ya fue avisado).
const llamados = createRateLimiter({ max: 1, windowMs: 45_000 });

export async function llamarMozo(aperturaId) {
  const apertura = await aperturaVigente(aperturaId);
  const repetido = llamados.blocked(apertura.id);
  if (!repetido) {
    llamados.hit(apertura.id);
    publish('mozo:llamado', { mozo: { mozo_id: apertura.mozo.id, mesa: apertura.numero, fecha: now() } });
  }
  return { ok: true, repetido, mozo: apertura.mozo.nombre };
}

/** QR del mozo para el panel de administración (SVG para ver/imprimir y PNG para descargar). */
export async function qrMozo(usuarioId) {
  const usuario = await usuariosRepo.findById(usuarioId);
  if (!usuario) throw notFound('El usuario no existe.');
  if (usuario.rol !== 'Mozo') throw conflict('Solo los mozos tienen código QR de mesas.');
  let token = usuario.qr_token;
  if (!token) {
    token = nuevoQrToken();
    await usuariosRepo.update(usuarioId, { qr_token: token });
  }
  const url = urlMesa(token);
  const opts = { margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14171a', light: '#ffffff' } };
  const [svg, png] = await Promise.all([QRCode.toString(url, { ...opts, type: 'svg' }), QRCode.toDataURL(url, { ...opts, width: 1024 })]);
  return { mozo: { id: usuario.id, nombre: usuario.nombre, activo: usuario.activo }, url, svg, png };
}
