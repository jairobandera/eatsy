import {
  categoriasService,
  ingredientesService,
  productosService,
  promocionesService,
  reglasPuntosService,
  usuariosService,
} from '../services/admin.services.js';
import { obtenerEstadisticas } from '../services/estadisticas.service.js';
import { publicUploadPath } from '../middlewares/upload.js';
import { today } from '../utils/dates.js';
import { parseId, validate } from '../utils/validator.js';
import { crudController, listParams, optionalNumber } from './helpers.js';

const ROLES = ['Administrador', 'Cajero', 'Cocina', 'Cliente', 'Mozo'];

export const categoriasController = crudController(categoriasService, {
  schema: { nombre: { type: 'string', required: true, maxLength: 255 } },
});

export const ingredientesController = crudController(ingredientesService, {
  schema: {
    nombre: { type: 'string', required: true, maxLength: 255 },
    descripcion: { type: 'string', required: true, maxLength: 500, label: 'descripción' },
    precio_extra: { type: 'number', min: 0, max: 999999, label: 'precio como extra' },
  },
});

export const usuariosController = crudController(usuariosService, {
  schema: {
    nombre: { type: 'string', required: true, maxLength: 100 },
    contrasena: { type: 'string', required: true, minLength: 8, maxLength: 200, label: 'contraseña' },
    rol: { type: 'enum', required: true, values: ROLES },
  },
  updateSchema: {
    nombre: { type: 'string', required: true, maxLength: 100 },
    contrasena: { type: 'string', minLength: 8, maxLength: 200, label: 'contraseña' },
    rol: { type: 'enum', required: true, values: ROLES },
  },
});

// ───────────── Productos (multipart/form-data por la imagen) ─────────────
const productoSchema = {
  nombre: { type: 'string', required: true, maxLength: 255 },
  descripcion: { type: 'string', required: true, maxLength: 2000, label: 'descripción' },
  precio: { type: 'number', required: true, min: 0, max: 9999999 },
  imagen_url: {
    type: 'string',
    maxLength: 500,
    pattern: /^(https?:\/\/|\/)\S+$/i,
    patternMessage: 'La URL de la imagen debe empezar con http(s):// o /',
    label: 'URL de imagen',
  },
  quitar_imagen: { type: 'boolean', default: false },
  categoria_ids: {
    type: 'array',
    required: true,
    min: 1,
    minMessage: 'Seleccioná al menos una categoría.',
    unique: true,
    items: { type: 'integer', min: 1 },
    label: 'categorías',
  },
  ingredientes: {
    type: 'array',
    default: [],
    items: { type: 'object', schema: { id: { type: 'integer', required: true, min: 1 }, es_obligatorio: { type: 'boolean', default: false } } },
  },
};

/** Valida y ejecuta; si algo falla, borra la imagen recién subida para no dejar archivos huérfanos. */
async function conImagen(req, fn) {
  const imagen = publicUploadPath(req.file);
  try {
    await fn(validate(req.body, productoSchema), imagen);
  } catch (err) {
    await productosService.descartarImagen(imagen);
    throw err;
  }
}

export const productosController = {
  list: async (req, res) => {
    const params = listParams(req.query);
    res.json(await productosService.list({ ...params, categoriaId: optionalNumber(req.query.categoria_id) }));
  },
  get: async (req, res) => res.json(await productosService.get(parseId(req.params.id))),
  create: (req, res) =>
    conImagen(req, async (data, imagen) => res.status(201).json(await productosService.create(data, imagen))),
  update: (req, res) =>
    conImagen(req, async (data, imagen) => res.json(await productosService.update(parseId(req.params.id), data, imagen))),
  deshabilitar: async (req, res) => res.json(await productosService.deshabilitar(parseId(req.params.id))),
  habilitar: async (req, res) => res.json(await productosService.habilitar(parseId(req.params.id))),
};

// ───────────── Promociones ─────────────
export const promocionesController = crudController(promocionesService, {
  schema: {
    nombre: { type: 'string', required: true, maxLength: 255 },
    tipo_descuento: { type: 'enum', values: ['porcentaje', 'monto'], default: 'porcentaje', label: 'tipo de descuento' },
    descuento: { type: 'number', required: true, min: 0, max: 9999999 },
    codigo: { type: 'string', maxLength: 30, pattern: /^[A-Za-z0-9]{3,30}$/, patternMessage: 'El código debe tener entre 3 y 30 letras o números, sin espacios.', label: 'código' },
    fecha_inicio: { type: 'date', label: 'fecha de inicio' },
    fecha_fin: { type: 'date', label: 'fecha de fin' },
    productos: { type: 'array', default: [], unique: true, items: { type: 'integer', min: 1 } },
  },
});

// ───────────── Reglas de puntos ─────────────
const reglaSchema = {
  monto_min: { type: 'number', required: true, min: 0, label: 'monto mínimo' },
  monto_max: { type: 'number', required: true, min: 0, label: 'monto máximo' },
  puntos_base: { type: 'integer', required: true, min: 1, label: 'puntos' },
};

export const reglasPuntosController = {
  list: async (_req, res) => res.json(await reglasPuntosService.list()),
  create: async (req, res) => res.status(201).json(await reglasPuntosService.create(validate(req.body, reglaSchema))),
  update: async (req, res) => res.json(await reglasPuntosService.update(parseId(req.params.id), validate(req.body, reglaSchema))),
  remove: async (req, res) => {
    await reglasPuntosService.remove(parseId(req.params.id));
    res.status(204).end();
  },
};

// ───────────── Estadísticas ─────────────
export async function getEstadisticas(req, res) {
  const hoy = today();
  const { start_date, end_date } = validate(
    { start_date: req.query.start_date || hoy, end_date: req.query.end_date || req.query.start_date || hoy },
    { start_date: { type: 'date', required: true, label: 'fecha de inicio' }, end_date: { type: 'date', required: true, label: 'fecha de fin' } },
  );
  res.json(await obtenerEstadisticas(start_date, end_date));
}
