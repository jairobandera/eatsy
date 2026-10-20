import { MAX_MESA } from '../services/pedidos.service.js';
import { infoQr, llamarMozo, pedidosDeMesa } from '../services/mesas.service.js';
import { notFound } from '../utils/http-error.js';
import { validate } from '../utils/validator.js';

/** Celular del cliente en una mesa: entra escaneando el QR del mozo (/mesa/<token>). */
const tokenParam = (req) => {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) throw notFound('Este código QR no es válido.');
  return token;
};
const mesaParam = (req) => validate({ mesa: req.params.mesa }, { mesa: { type: 'integer', required: true, min: 1, max: MAX_MESA, label: 'número de mesa' } }).mesa;

export const mesaController = {
  info: async (req, res) => res.json(await infoQr(tokenParam(req))),
  pedidos: async (req, res) => res.json(await pedidosDeMesa(tokenParam(req), mesaParam(req))),
  llamar: async (req, res) => res.json(await llamarMozo(tokenParam(req), mesaParam(req), req.ip)),
};
