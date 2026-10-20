import crypto from 'node:crypto';
import QRCode from 'qrcode';
import config from '../config/index.js';
import { usuariosRepo } from '../repositories/catalogo.repositories.js';
import { now } from '../utils/dates.js';
import { conflict, forbidden, notFound } from '../utils/http-error.js';
import { publicBaseUrl } from '../utils/network.js';
import { createRateLimiter } from '../utils/rate-limit.js';
import { publish } from '../websocket/realtime.js';
import { listarMesas } from './pedidos.service.js';
import { toMesaDto } from './seguimiento.service.js';

/**
 * Mesas atendidas por mozos. Cada mozo tiene un QR propio (se imprime y se pone en sus mesas):
 * el cliente lo escanea, indica su número de mesa, ve el estado de sus pedidos y puede llamar al mozo.
 * El QR lleva un token al azar (no el id del usuario) para que no se pueda adivinar el de otro mozo.
 */
export const nuevoQrToken = () => crypto.randomBytes(12).toString('base64url');

export const urlMesa = (token) => `${publicBaseUrl(config)}/mesa/${token}`;

async function mozoDelQr(token) {
  const mozo = await usuariosRepo.findMozoByQrToken(token);
  if (!mozo) throw notFound('Este código QR ya no está disponible. Pedile ayuda a un mozo.');
  return mozo;
}

/** Id del mozo dueño de un QR (lo usa el WebSocket para suscribir el celular de la mesa). */
export async function resolverMesa(token) {
  return (await usuariosRepo.findMozoByQrToken(token))?.id ?? null;
}

export async function infoQr(token) {
  const mozo = await mozoDelQr(token);
  return { mozo: { nombre: mozo.nombre } };
}

/** Pedidos abiertos de una mesa (lo que todavía no se sirvió y cobró). */
export async function pedidosDeMesa(token, mesa) {
  const mozo = await mozoDelQr(token);
  const [abierta] = await listarMesas({ mozoId: mozo.id, mesa });
  return {
    mozo: { nombre: mozo.nombre },
    mesa,
    pedidos: (abierta?.pedidos || []).map(toMesaDto),
    total: abierta?.total ?? 0,
    pendiente: abierta?.pendiente ?? 0,
  };
}

// Un llamado por mesa cada 45 s (el mozo ya fue avisado) y máx. 12 por IP cada 10 min (abuso).
const llamadosMesa = createRateLimiter({ max: 1, windowMs: 45_000 });
const llamadosIp = createRateLimiter({ max: 12, windowMs: 10 * 60_000 });

export async function llamarMozo(token, mesa, ip) {
  if (llamadosIp.blocked(ip)) throw forbidden('Demasiados llamados seguidos. Esperá unos minutos.');
  const mozo = await mozoDelQr(token);
  const key = `${mozo.id}:${mesa}`;
  if (llamadosMesa.blocked(key)) return { ok: true, repetido: true, mozo: mozo.nombre };
  llamadosMesa.hit(key);
  llamadosIp.hit(ip);
  publish('mozo:llamado', { mozo: { mozo_id: mozo.id, mesa, fecha: now() } });
  return { ok: true, repetido: false, mozo: mozo.nombre };
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
