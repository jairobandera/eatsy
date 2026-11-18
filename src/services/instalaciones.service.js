import crypto from 'node:crypto';
import config from '../config/index.js';
import { sql } from '../db/connection.js';
import { usuariosRepo } from '../repositories/catalogo.repositories.js';
import { estadisticasRepo } from '../repositories/estadisticas.repository.js';
import { today } from '../utils/dates.js';
import { publicBaseUrl } from '../utils/network.js';
import { estadoLicencia, guardarConfig, obtenerConfig } from './config.service.js';

/**
 * Panel central del superadmin: cada instalación (un negocio) responde su estado en
 * GET /api/superadmin/estado, protegido con la clave SUPERADMIN_API_KEY que es la misma en
 * todas tus instalaciones. Desde el panel de cualquiera se consultan todas a la vez.
 */
export const TIMEOUT_MS = 30_000; // margen para instalaciones lentas en responder
export const MAX_INSTALACIONES = 100;

/** ¿El pedido trae la clave del panel central? (comparación en tiempo constante) */
export function claveValida(header) {
  if (!config.superadminApiKey) return false;
  const m = /^Bearer\s+(.+)$/i.exec(String(header || ''));
  if (!m) return false;
  const a = crypto.createHash('sha256').update(m[1].trim()).digest();
  const b = crypto.createHash('sha256').update(config.superadminApiKey).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Resumen de esta instalación para el panel central. */
export async function estadoInstalacion() {
  const cfg = obtenerConfig();
  const hoy = today();
  const mes = `${hoy.slice(0, 8)}01`;
  const [usuarios, ventasHoy, ventasMes, ultimo] = await Promise.all([
    usuariosRepo.resumenPorRol(),
    estadisticasRepo.resumen(`${hoy} 00:00:00`, `${hoy} 23:59:59`),
    estadisticasRepo.resumen(`${mes} 00:00:00`, `${hoy} 23:59:59`),
    sql.get('SELECT MAX(created_at) AS f FROM pedidos'),
  ]);
  return {
    nombre: cfg.negocio.nombre,
    url: publicBaseUrl(config),
    version: config.version,
    paquete: { ...cfg.paquete },
    licencia: { ...estadoLicencia(cfg), motivo: cfg.licencia.motivo || '' },
    usuarios,
    hoy: { pedidos: Number(ventasHoy.pedidos.total), ventas: Number(ventasHoy.ventas.total) },
    mes: { pedidos: Number(ventasMes.pedidos.total), ventas: Number(ventasMes.ventas.total) },
    ultimo_pedido: ultimo?.f ?? null,
    consultado: new Date().toISOString(),
  };
}

const normalizarUrl = (url) => {
  const u = new URL(String(url).trim());
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocolo');
  return u.origin;
};

/** Valida y guarda la lista de instalaciones [{ nombre, url }]. */
export async function guardarInstalaciones(lista) {
  const vistas = new Set();
  const limpia = [];
  for (const item of lista.slice(0, MAX_INSTALACIONES)) {
    let url;
    try {
      url = normalizarUrl(item.url);
    } catch {
      throw Object.assign(new Error(`La dirección "${item.url}" no es válida (tiene que empezar con https://).`), { status: 422 });
    }
    if (vistas.has(url)) continue;
    vistas.add(url);
    limpia.push({ nombre: String(item.nombre || '').trim().slice(0, 60), url });
  }
  await guardarConfig({ instalaciones: { lista: limpia } });
  return limpia;
}

/** Consulta una instalación remota. */
async function consultar(item) {
  const inicio = Date.now();
  try {
    const r = await fetch(`${item.url}/api/superadmin/estado`, {
      headers: { Authorization: `Bearer ${config.superadminApiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = Date.now() - inicio;
    if (r.status === 404) return { ...item, ok: false, ms, error: 'No respondió el estado: revisá que tenga la misma SUPERADMIN_API_KEY y la versión nueva.' };
    if (!r.ok) return { ...item, ok: false, ms, error: `Respondió con error ${r.status}.` };
    return { ...item, ok: true, ms, estado: await r.json() };
  } catch (err) {
    const ms = Date.now() - inicio;
    const error = err.name === 'TimeoutError' ? 'No respondió a tiempo (puede estar dormida: probá de nuevo en un minuto).' : 'No se pudo conectar.';
    return { ...item, ok: false, ms, error };
  }
}

/**
 * Reenvía un pedido del superadmin a otra instalación de la lista (solo a las guardadas: nunca a
 * una dirección arbitraria) con la clave compartida, y devuelve su respuesta tal cual.
 */
export async function reenviarARemota(req, res, subruta) {
  const item = (obtenerConfig().instalaciones.lista || [])[Number(req.params.n)];
  if (!/^\d+$/.test(req.params.n) || !item) return res.status(404).json({ message: 'Esa instalación no está en tu lista.' });
  if (!config.superadminApiKey) return res.status(409).json({ message: 'Falta configurar SUPERADMIN_API_KEY en esta instalación.' });

  const headers = { Authorization: `Bearer ${config.superadminApiKey}`, 'X-Requested-With': 'fetch', Accept: 'application/json' };
  let body;
  if (req.file) {
    body = new FormData();
    body.append('logo', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'logo');
  } else if (req.method === 'PUT') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(req.body ?? {});
  }

  let r;
  try {
    r = await fetch(`${item.url}/api/superadmin${subruta}`, {
      method: req.method,
      headers,
      body,
      // El respaldo puede tardar; lo demás tiene el mismo margen que el panel.
      signal: subruta === '/respaldo' ? undefined : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'La instalación no respondió a tiempo. Probá de nuevo en un minuto.' : 'No se pudo conectar con la instalación.';
    return res.status(502).json({ message: msg });
  }
  if (r.status === 404) {
    return res.status(502).json({ message: 'La instalación no aceptó el pedido: revisá que tenga la misma SUPERADMIN_API_KEY y la versión nueva (redesplegala).' });
  }
  // Un 401 de la otra instalación no es tu sesión: no tiene que cerrarla acá.
  res.status(r.status === 401 ? 502 : r.status);
  for (const h of ['content-type', 'content-disposition']) if (r.headers.get(h)) res.set(h, r.headers.get(h));
  if (!r.body) return res.end();
  const lector = r.body.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    if (!res.write(value)) await new Promise((ok) => res.once('drain', ok));
  }
  res.end();
}

/** Estado de esta instalación y de todas las guardadas, en paralelo. */
export async function panelInstalaciones() {
  const lista = obtenerConfig().instalaciones.lista || [];
  const propia = await estadoInstalacion();
  const remotas = config.superadminApiKey
    ? await Promise.all(lista.map(consultar))
    : lista.map((item) => ({ ...item, ok: false, ms: 0, error: 'Falta configurar SUPERADMIN_API_KEY en esta instalación.' }));
  return {
    clave_configurada: Boolean(config.superadminApiKey),
    esta: { nombre: propia.nombre, url: propia.url, ok: true, ms: 0, estado: propia, propia: true },
    instalaciones: remotas,
  };
}
