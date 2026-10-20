import { MESA_COOKIE } from '../middlewares/auth.js';
import config from '../config/index.js';
import { MAX_MESA } from '../services/pedidos.service.js';
import { MESA_ACCESO_HORAS, infoQr, ingresarMesa, llamarMozo, pedidosDeMesa } from '../services/mesas.service.js';
import { notFound } from '../utils/http-error.js';
import { validate } from '../utils/validator.js';

/**
 * Celular del cliente en una mesa: escanea el QR del mozo (/mesa/<token>) y entra con
 * el número de mesa + el código que le da el mozo. Queda una cookie que solo vale para esa
 * mesa mientras esté abierta.
 */
const tokenParam = (req) => {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) throw notFound('Este código QR no es válido.');
  return token;
};

const cookieOpts = () => ({ httpOnly: true, sameSite: 'lax', secure: config.isProduction, path: '/', maxAge: MESA_ACCESO_HORAS * 3600 * 1000 });

export const mesaController = {
  info: async (req, res) => res.json(await infoQr(tokenParam(req))),

  ingresar: async (req, res) => {
    const data = validate(req.body, {
      mesa: { type: 'integer', required: true, min: 1, max: MAX_MESA, label: 'número de mesa' },
      codigo: { type: 'string', required: true, maxLength: 10, label: 'código de la mesa' },
    });
    const { acceso, mesa } = await ingresarMesa({ token: tokenParam(req), numero: data.mesa, codigo: data.codigo, ip: req.ip });
    res.cookie(MESA_COOKIE, acceso, cookieOpts());
    res.json(mesa);
  },

  /** Mesa a la que entró este celular; 204 si todavía no ingresó a ninguna. */
  actual: async (req, res) => {
    if (!req.mesaAccesoId) return res.status(204).end();
    res.json(await pedidosDeMesa(req.mesaAccesoId));
  },

  llamar: async (req, res) => {
    if (!req.mesaAccesoId) throw notFound('Primero ingresá el código de tu mesa.');
    res.json(await llamarMozo(req.mesaAccesoId));
  },

  /** "No es mi mesa": olvida la mesa de este celular. */
  salir: (_req, res) => {
    const { maxAge, ...opts } = cookieOpts();
    res.clearCookie(MESA_COOKIE, opts);
    res.json({ ok: true });
  },
};
