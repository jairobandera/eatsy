import QRCode from 'qrcode';
import config from '../config/index.js';
import { SEGUIMIENTO_COOKIE, seguimientoCookieOptions } from '../middlewares/auth.js';
import { SEGUIMIENTO_HORAS, iniciarSeguimiento, obtenerSeguimiento } from '../services/seguimiento.service.js';
import { publicBaseUrl } from '../utils/network.js';
import { validate } from '../utils/validator.js';

export const seguimientoController = {
  /** El cliente ingresa su código (y cédula si corresponde) → cookie de seguimiento. */
  async iniciar(req, res) {
    const data = validate(req.body, {
      codigo: { type: 'string', required: true, maxLength: 20, label: 'código del pedido' },
      cedula: { type: 'string', maxLength: 20, label: 'cédula' },
    });
    const { token, pedido } = await iniciarSeguimiento({ ...data, ip: req.ip });
    res.cookie(SEGUIMIENTO_COOKIE, token, seguimientoCookieOptions(SEGUIMIENTO_HORAS));
    res.json(pedido);
  },

  /** Pedido que sigue este dispositivo; 204 si todavía no ingresó ninguno. */
  async ver(req, res) {
    if (!req.seguimientoId) return res.status(204).end();
    res.json(await obtenerSeguimiento(req.seguimientoId));
  },

  /** "Seguir otro pedido": olvida el pedido actual. */
  salir(_req, res) {
    const { maxAge, ...opts } = seguimientoCookieOptions(SEGUIMIENTO_HORAS);
    res.clearCookie(SEGUIMIENTO_COOKIE, opts);
    res.json({ ok: true });
  },
};

let qrCache = null;

/** QR (SVG) con la URL de seguimiento, para mostrar en la pantalla de llamados. */
export async function qrSeguimiento(_req, res) {
  const url = `${publicBaseUrl(config)}/seguimiento`;
  if (qrCache?.url !== url) {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14171a', light: '#ffffff' } });
    qrCache = { url, svg };
  }
  // Sin caché en el navegador: si el superadmin apaga el seguimiento, el QR tiene que desaparecer ya
  // (el SVG igual queda memorizado acá, así que generarlo no cuesta nada).
  res.set('Cache-Control', 'no-store').json(qrCache);
}
