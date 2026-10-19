import { clientesRepo } from '../repositories/clientes.repository.js';
import { conflict, notFound } from '../utils/http-error.js';

const pick = (c) =>
  c && {
    id: c.id,
    cedula: c.cedula,
    nombre: c.nombre,
    apellido: c.apellido,
    telefono: c.telefono,
    puntos: c.puntos,
    activo: c.activo,
  };

export const clientesService = {
  async buscar(cedula) {
    if (cedula.length < 3) return [];
    return (await clientesRepo.searchByCedula(cedula)).map(pick);
  },

  async porCedula(cedula) {
    const cliente = await clientesRepo.findByCedula(cedula);
    if (!cliente) throw notFound('No se encontró ningún cliente con esa cédula.');
    return pick(cliente);
  },

  async create(data) {
    if (await clientesRepo.findByCedula(data.cedula)) throw conflict('Ya existe un cliente con esa cédula.');
    const id = await clientesRepo.insert({ ...data, telefono: data.telefono || null, puntos: 0, activo: 1 });
    return pick(await clientesRepo.findById(id));
  },

  async update(id, data) {
    if (!(await clientesRepo.findById(id))) throw notFound('Cliente no encontrado.');
    await clientesRepo.update(id, { nombre: data.nombre, apellido: data.apellido, telefono: data.telefono || null });
    return pick(await clientesRepo.findById(id));
  },
};
