import { sql } from '../db/connection.js';
import { now, today } from '../utils/dates.js';

/**
 * Configuración de la instalación, la maneja solo el superadmin (cada negocio tiene su propia
 * instalación). Se guarda en la tabla `configuracion` (una fila por sección, en JSON) y se
 * mantiene en memoria: se carga al arrancar (`cargarConfig`) y se refresca al guardar.
 *
 * Los valores por defecto reproducen el comportamiento de siempre (paquete Full, sin vencimiento,
 * marca Eatsy, sin límites y todos los módulos), así una instalación existente sigue igual.
 */
export const PAQUETES = ['full', 'totem'];
export const MODULOS = ['cupones', 'puntos', 'seguimiento', 'estadisticas'];
export const ROLES_LIMITABLES = ['Administrador', 'Cajero', 'Cocina', 'Mozo', 'Cliente'];
export const DIAS_AVISO_VENCIMIENTO = 7;

export const DEFAULTS = Object.freeze({
  paquete: { tipo: 'full', cocina: true },
  // tipo 'pago' (con fecha de vencimiento) o 'gratis' (sin vencimiento hasta que el superadmin la cambie).
  licencia: { tipo: 'pago', vence: null, suspendida: false, motivo: '' },
  negocio: { nombre: 'Eatsy', color: '#ff5722', logo: null },
  limites: { Administrador: null, Cajero: null, Cocina: null, Mozo: null, Cliente: null },
  modulos: { cupones: true, puntos: true, seguimiento: true, estadisticas: true },
  // Otras instalaciones (de otros negocios) que este superadmin ve en su panel central.
  instalaciones: { lista: [] },
});
export const TIPOS_LICENCIA = ['pago', 'gratis'];

let actual = structuredClone(DEFAULTS);
let version = 0;
const listeners = [];

const mezclar = (guardado) =>
  Object.fromEntries(Object.entries(DEFAULTS).map(([clave, def]) => [clave, { ...def, ...(guardado[clave] || {}) }]));

/** Lee la configuración guardada (llamar al arrancar, después de initDatabase). */
export async function cargarConfig() {
  const rows = await sql.all('SELECT clave, valor FROM configuracion');
  const guardado = {};
  for (const r of rows) {
    try {
      guardado[r.clave] = JSON.parse(r.valor);
    } catch {
      /* fila corrupta: se usan los valores por defecto */
    }
  }
  actual = mezclar(guardado);
  version += 1;
  listeners.forEach((fn) => fn(actual));
  return actual;
}

/** Configuración vigente (sincrónica, desde memoria). */
export const obtenerConfig = () => actual;
/** Cambia cada vez que se guarda: sirve para invalidar cachés (páginas, logo). */
export const versionConfig = () => version;
export const alCambiarConfig = (fn) => listeners.push(fn);

/** Guarda las secciones indicadas (cada una completa) y recarga la configuración. */
export async function guardarConfig(secciones) {
  const ts = now();
  for (const [clave, valor] of Object.entries(secciones)) {
    if (!(clave in DEFAULTS)) continue;
    await sql.run(
      'INSERT INTO configuracion (clave, valor, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor), updated_at = VALUES(updated_at)',
      [clave, JSON.stringify(valor), ts],
    );
  }
  return cargarConfig();
}

// ───────────── Reglas derivadas ─────────────

/** Roles que el paquete permite usar. Tótem: kiosco + administrador (+ cocina si se incluye). */
export function rolesHabilitados(cfg = actual) {
  if (cfg.paquete.tipo === 'totem') return ['Administrador', 'Cliente', ...(cfg.paquete.cocina ? ['Cocina'] : [])];
  return ['Administrador', 'Cajero', 'Cocina', 'Mozo', 'Cliente'];
}

export const rolHabilitado = (rol, cfg = actual) => rol === 'Superadmin' || rolesHabilitados(cfg).includes(rol);
export const moduloActivo = (nombre, cfg = actual) => cfg.modulos[nombre] !== false;
export const esTotem = (cfg = actual) => cfg.paquete.tipo === 'totem';

/** Días entre dos fechas 'YYYY-MM-DD' (b - a). */
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * Estado de la licencia: 'gratis' | 'ok' | 'por_vencer' (faltan ≤ 7 días) | 'vencida' | 'suspendida'.
 * El día del vencimiento todavía se puede usar; se corta al día siguiente.
 * Una licencia gratuita no vence nunca (hasta que el superadmin la pase a pago o la suspenda).
 */
export function estadoLicencia(cfg = actual, hoy = today()) {
  const { vence, suspendida, tipo } = cfg.licencia;
  if (suspendida) return { estado: 'suspendida', tipo, vence, dias: null };
  if (tipo === 'gratis') return { estado: 'gratis', tipo, vence: null, dias: null };
  if (!vence) return { estado: 'ok', tipo, vence: null, dias: null };
  const dias = diasEntre(hoy, vence);
  if (dias < 0) return { estado: 'vencida', tipo, vence, dias };
  return { estado: dias <= DIAS_AVISO_VENCIMIENTO ? 'por_vencer' : 'ok', tipo, vence, dias };
}

export const licenciaBloqueada = (cfg = actual, hoy = today()) => ['vencida', 'suspendida'].includes(estadoLicencia(cfg, hoy).estado);

// ───────────── Colores de la marca ─────────────
const hex = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
const rgb = (color) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color || '').trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** Color principal y sus variantes (oscuro para hover/textos, suave para fondos). */
export function paletaMarca(color) {
  const c = rgb(color) || rgb(DEFAULTS.negocio.color);
  const mezcla = (destino, t) => `#${c.map((x, i) => hex(x + (destino[i] - x) * t)).join('')}`;
  return { brand: mezcla(c, 0), dark: mezcla([0, 0, 0], 0.12), soft: mezcla([255, 255, 255], 0.92), light: mezcla([255, 255, 255], 0.3) };
}

export const colorValido = (color) => rgb(color) !== null;
