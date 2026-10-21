import path from 'node:path';
import config from '../config/index.js';
import { usuariosRepo } from '../repositories/catalogo.repositories.js';
import {
  DEFAULTS,
  MODULOS,
  PAQUETES,
  ROLES_LIMITABLES,
  TIPOS_LICENCIA,
  colorValido,
  estadoLicencia,
  guardarConfig,
  obtenerConfig,
  paletaMarca,
  rolesHabilitados,
  versionConfig,
} from '../services/config.service.js';
import { generarRespaldo, nombreRespaldo } from '../services/respaldo.service.js';
import { guardarInstalaciones, panelInstalaciones } from '../services/instalaciones.service.js';
import { invalidarPaginas } from '../utils/assets.js';
import { isValidYmd } from '../utils/dates.js';
import { badRequest, unprocessable } from '../utils/http-error.js';
import { validate } from '../utils/validator.js';
import { publish } from '../websocket/realtime.js';

/** Marca y funciones habilitadas: las pantallas lo usan para mostrar/ocultar secciones. */
export function negocioPublico(req, res) {
  const cfg = obtenerConfig();
  const base = {
    nombre: cfg.negocio.nombre,
    color: paletaMarca(cfg.negocio.color),
    logo_url: `/negocio/logo?v=${versionConfig()}`,
    paquete: cfg.paquete.tipo,
    roles: rolesHabilitados(cfg),
    modulos: cfg.modulos,
  };
  // El estado de la licencia solo lo ve el personal (para el aviso de vencimiento) y los límites, el administrador.
  if (req.user) base.licencia = estadoLicencia(cfg);
  if (['Administrador', 'Superadmin'].includes(req.user?.rol)) base.limites = cfg.limites;
  res.json(base);
}

/** Logo del negocio (guardado como data URL en la configuración) o el de Eatsy. */
export function logoNegocio(_req, res) {
  const logo = obtenerConfig().negocio.logo;
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(logo || '');
  res.set('Cache-Control', 'public, max-age=86400');
  if (!m) return res.sendFile(path.join(config.paths.public, 'img', 'logo.png'));
  res.type(m[1]).send(Buffer.from(m[2], 'base64'));
}

// ───────────── API del superadmin ─────────────

async function resumen() {
  const cfg = obtenerConfig();
  const { logo, ...negocio } = cfg.negocio;
  return {
    config: { ...cfg, negocio: { ...negocio, tiene_logo: Boolean(logo) } },
    roles_habilitados: rolesHabilitados(cfg),
    usuarios: await usuariosRepo.resumenPorRol(),
    licencia: estadoLicencia(cfg),
    defaults: DEFAULTS,
  };
}

const despuesDeGuardar = () => {
  invalidarPaginas();
  publish('config:actualizada', { staff: {}, kiosco: {}, publico: {}, mozo: {} });
};

export const superadminController = {
  ver: async (_req, res) => res.json(await resumen()),

  guardar: async (req, res) => {
    const b = req.body || {};
    const limiteSchema = { type: 'integer', min: 0, max: 999 };
    const paquete = validate(b.paquete, {
      tipo: { type: 'enum', required: true, values: PAQUETES, label: 'paquete' },
      cocina: { type: 'boolean', default: true },
    });
    const licencia = validate(b.licencia, {
      tipo: { type: 'enum', values: TIPOS_LICENCIA, default: 'pago', label: 'tipo de licencia' },
      vence: { type: 'string', maxLength: 10, label: 'vencimiento' },
      suspendida: { type: 'boolean', default: false },
      motivo: { type: 'string', maxLength: 200 },
    });
    if (licencia.vence && !isValidYmd(licencia.vence)) throw unprocessable('La fecha de vencimiento no es válida.');
    const negocio = validate(b.negocio, {
      nombre: { type: 'string', required: true, maxLength: 60, label: 'nombre del negocio' },
      color: { type: 'string', required: true, maxLength: 7, label: 'color' },
    });
    if (!colorValido(negocio.color)) throw unprocessable('El color tiene que tener el formato #RRGGBB.');
    const limites = validate(b.limites, Object.fromEntries(ROLES_LIMITABLES.map((r) => [r, limiteSchema])));
    if (limites.Administrador === 0) throw unprocessable('Tiene que poder haber al menos un administrador.');
    const modulos = validate(b.modulos, Object.fromEntries(MODULOS.map((m) => [m, { type: 'boolean', default: true }])));

    const actual = obtenerConfig();
    await guardarConfig({
      paquete,
      // Gratuita: no tiene fecha de vencimiento (dura hasta que se pase a pago o se suspenda).
      licencia: {
        tipo: licencia.tipo,
        vence: licencia.tipo === 'gratis' ? null : licencia.vence || null,
        suspendida: licencia.suspendida,
        motivo: licencia.motivo || '',
      },
      negocio: { ...actual.negocio, nombre: negocio.nombre, color: negocio.color.toLowerCase() },
      limites: Object.fromEntries(ROLES_LIMITABLES.map((r) => [r, limites[r] ?? null])),
      modulos,
    });
    despuesDeGuardar();
    res.json(await resumen());
  },

  subirLogo: async (req, res) => {
    if (!req.file) throw badRequest('Elegí una imagen (PNG, JPG, WEBP o GIF, máx. 300 KB).');
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    await guardarConfig({ negocio: { ...obtenerConfig().negocio, logo: dataUrl } });
    despuesDeGuardar();
    res.json(await resumen());
  },

  /** Panel central: esta instalación y las demás guardadas, con su estado. */
  instalaciones: async (_req, res) => res.json(await panelInstalaciones()),

  guardarInstalaciones: async (req, res) => {
    const { lista } = validate(req.body, {
      lista: {
        type: 'array',
        required: true,
        items: { type: 'object', schema: { nombre: { type: 'string', maxLength: 60 }, url: { type: 'string', required: true, maxLength: 300, label: 'dirección' } } },
      },
    });
    try {
      await guardarInstalaciones(lista);
    } catch (err) {
      if (err.status === 422) throw unprocessable(err.message);
      throw err;
    }
    res.json(await panelInstalaciones());
  },

  /** Descarga un respaldo completo de la base (.sql). */
  respaldo: async (_req, res) => {
    res.set({
      'Content-Type': 'application/sql; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombreRespaldo(obtenerConfig().negocio.nombre)}"`,
    });
    try {
      await generarRespaldo((chunk) => (res.write(chunk) ? undefined : new Promise((ok) => res.once('drain', ok))));
      res.end();
    } catch (err) {
      console.error('[respaldo]', err);
      // Ya se empezó a mandar el archivo: se corta con una marca para que no parezca completo.
      res.end('\n-- ERROR: el respaldo quedó incompleto.\n');
    }
  },

  quitarLogo: async (_req, res) => {
    await guardarConfig({ negocio: { ...obtenerConfig().negocio, logo: null } });
    despuesDeGuardar();
    res.json(await resumen());
  },
};
