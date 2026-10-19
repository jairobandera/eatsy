import { pagination, parseId, validate } from '../utils/validator.js';

/** ?estado=activos|inactivos|todos → true|false|undefined */
export function filtroActivo(query) {
  if (query.estado === 'inactivos') return false;
  if (query.estado === 'todos') return undefined;
  return true;
}

export function listParams(query, perPage = 10) {
  const { page, perPage: pp } = pagination(query, perPage);
  return {
    activo: filtroActivo(query),
    buscar: typeof query.buscar === 'string' ? query.buscar.trim().slice(0, 100) : '',
    page,
    perPage: pp,
  };
}

export function optionalNumber(value) {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Controlador CRUD estándar para un servicio con
 * list / getOrFail|get / create / update / deshabilitar / habilitar.
 */
export function crudController(service, { schema, updateSchema = schema, perPage = 10 }) {
  const getFn = (service.getOrFail || service.get).bind(service);
  return {
    list: async (req, res) => res.json(await service.list(listParams(req.query, perPage))),
    get: async (req, res) => res.json(await getFn(parseId(req.params.id))),
    create: async (req, res) => res.status(201).json(await service.create(validate(req.body, schema), req.user)),
    update: async (req, res) => res.json(await service.update(parseId(req.params.id), validate(req.body, updateSchema), req.user)),
    deshabilitar: async (req, res) => res.json(await service.deshabilitar(parseId(req.params.id), req.user)),
    habilitar: async (req, res) => res.json(await service.habilitar(parseId(req.params.id), req.user)),
  };
}
