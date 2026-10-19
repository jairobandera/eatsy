import { conflict, notFound } from '../utils/http-error.js';
import { paginated } from '../utils/validator.js';
import { publish } from '../websocket/realtime.js';

/** Avisa a kioscos y cajas que el catálogo cambió (para que recarguen). */
export function avisarCatalogo(recurso) {
  publish('catalogo:actualizado', { staff: { recurso }, kiosco: { recurso } });
}

/**
 * Servicio CRUD genérico con "baja lógica" (activo = 0) y nombres únicos.
 * Reproduce las reglas del sistema original:
 *  - no se puede crear/renombrar con un nombre que ya existe (sin importar mayúsculas/tildes);
 *  - no se puede habilitar si ya hay otro activo con el mismo nombre.
 */
export function createCatalogService({ repo, entidad, genero = 'o', notificar = true, toRecord = (d) => d }) {
  const art = genero === 'a' ? 'La' : 'El';
  const avisar = () => notificar && avisarCatalogo(repo.table);

  async function getOrFail(id) {
    const item = await repo.findById(id);
    if (!item) throw notFound(`${art} ${entidad} no existe.`);
    return item;
  }

  return {
    getOrFail,

    async list({ activo, buscar, page, perPage }) {
      const { rows, total } = await repo.list({ activo, buscar, limit: perPage, offset: (page - 1) * perPage });
      return paginated(rows, total, { page, perPage });
    },

    async create(data) {
      if (await repo.existsByName(data.nombre)) throw conflict(`Ya existe un${genero === 'a' ? 'a' : ''} ${entidad} llamad${genero} "${data.nombre}".`);
      const id = await repo.insert(await toRecord(data));
      avisar();
      return repo.findById(id);
    },

    async update(id, data) {
      await getOrFail(id);
      if (await repo.existsByName(data.nombre, { excludeId: id })) {
        throw conflict(`Ya existe otr${genero} ${entidad} llamad${genero} "${data.nombre}".`);
      }
      await repo.update(id, await toRecord(data, { id }));
      avisar();
      return repo.findById(id);
    },

    async deshabilitar(id) {
      const item = await getOrFail(id);
      await repo.setActivo(id, false);
      avisar();
      return { ...item, activo: false };
    },

    async habilitar(id) {
      const item = await getOrFail(id);
      if (await repo.existsByName(item.nombre, { excludeId: id, onlyActive: true })) {
        throw conflict(`No se puede habilitar: ya hay otr${genero} ${entidad} activ${genero} llamad${genero} "${item.nombre}".`);
      }
      await repo.setActivo(id, true);
      avisar();
      return { ...item, activo: true };
    },
  };
}
