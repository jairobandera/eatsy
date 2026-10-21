import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/index.js';
import { transaction } from '../db/connection.js';
import { categoriasRepo, ingredientesRepo, usuariosRepo } from '../repositories/catalogo.repositories.js';
import { reglasPuntosRepo } from '../repositories/clientes.repository.js';
import { productosRepo } from '../repositories/productos.repository.js';
import { promocionesRepo } from '../repositories/promociones.repository.js';
import { today } from '../utils/dates.js';
import { conflict, notFound, unprocessable } from '../utils/http-error.js';
import { hashPassword } from '../utils/password.js';
import { paginated } from '../utils/validator.js';
import { avisarCatalogo, createCatalogService } from './catalogo.service.js';
import { nuevoQrToken } from './mesas.service.js';
import { ROL_LABEL } from './auth.service.js';
import { moduloActivo, obtenerConfig, rolHabilitado } from './config.service.js';
import { conPrecios } from './pricing.service.js';

// ───────────── Categorías e ingredientes ─────────────
export const categoriasService = createCatalogService({ repo: categoriasRepo, entidad: 'categoría', genero: 'a' });

export const ingredientesService = createCatalogService({
  repo: ingredientesRepo,
  entidad: 'ingrediente',
  // Precio de extra vacío o 0 = no se ofrece como extra (solo se puede quitar).
  toRecord: (data) => ('precio_extra' in data ? { ...data, precio_extra: Number(data.precio_extra) > 0 ? data.precio_extra : null } : data),
});

// ───────────── Usuarios ─────────────
const usuariosBase = createCatalogService({
  repo: usuariosRepo,
  entidad: 'usuario',
  notificar: false,
  toRecord: async (data, { id } = {}) => {
    const record = { nombre: data.nombre, rol: data.rol };
    if (data.contrasena) record.contrasena = hashPassword(data.contrasena);
    // Cada mozo tiene su QR de mesas desde que se crea (o desde que pasa a ser mozo).
    if (data.rol === 'Mozo' && !(id && (await usuariosRepo.findById(id))?.qr_token)) record.qr_token = nuevoQrToken();
    return record;
  },
});

/**
 * Reglas del paquete para tener un usuario activo con ese rol: el rol tiene que estar incluido
 * y no superar el límite de usuarios activos (lo configura el superadmin).
 */
async function validarRolDelPaquete(rol, { excludeId = 0 } = {}) {
  if (!rolHabilitado(rol)) throw conflict(`El paquete contratado no incluye usuarios de tipo ${ROL_LABEL[rol] || rol}.`);
  const limite = obtenerConfig().limites[rol];
  if (limite != null && (await usuariosRepo.countActivosPorRol(rol, { excludeId })) >= limite) {
    throw conflict(`El paquete contratado permite hasta ${limite} usuario${limite === 1 ? '' : 's'} activo${limite === 1 ? '' : 's'} de tipo ${ROL_LABEL[rol] || rol}.`);
  }
}

export const usuariosService = {
  ...usuariosBase,

  async create(data, actor) {
    await validarRolDelPaquete(data.rol);
    return usuariosBase.create(data, actor);
  },

  async habilitar(id, actor) {
    const usuario = await usuariosBase.getOrFail(id);
    await validarRolDelPaquete(usuario.rol, { excludeId: id });
    return usuariosBase.habilitar(id, actor);
  },

  async update(id, data, actor) {
    const usuario = await usuariosBase.getOrFail(id);
    if (usuario.activo && usuario.rol !== data.rol) await validarRolDelPaquete(data.rol, { excludeId: id });
    if (usuario.rol === 'Administrador' && data.rol !== 'Administrador' && (await usuariosRepo.countActiveAdmins({ excludeId: id })) === 0) {
      throw conflict('No podés quitarle el rol al último administrador activo.');
    }
    if (actor.id === id && data.rol !== 'Administrador') throw conflict('No podés quitarte a vos mismo el rol de administrador.');
    return usuariosBase.update(id, data);
  },

  async deshabilitar(id, actor) {
    if (actor.id === id) throw conflict('No podés deshabilitar tu propio usuario.');
    const usuario = await usuariosBase.getOrFail(id);
    if (usuario.rol === 'Administrador' && (await usuariosRepo.countActiveAdmins({ excludeId: id })) === 0) {
      throw conflict('No se puede deshabilitar al último administrador activo.');
    }
    return usuariosBase.deshabilitar(id);
  },
};

// ───────────── Productos ─────────────
const isLocalUpload = (img) => typeof img === 'string' && img.startsWith('/uploads/');

async function borrarImagenLocal(img) {
  if (!isLocalUpload(img)) return;
  const file = path.join(config.paths.uploads, img.replace('/uploads/', ''));
  if (!file.startsWith(config.paths.uploads)) return;
  await fs.unlink(file).catch(() => {});
}

async function validarRelaciones({ categoria_ids, ingredientes }) {
  for (const id of categoria_ids) {
    if (!(await categoriasRepo.findById(id))) throw unprocessable('Una de las categorías seleccionadas no existe.');
  }
  for (const ing of ingredientes) {
    if (!(await ingredientesRepo.findById(ing.id))) throw unprocessable('Uno de los ingredientes seleccionados no existe.');
  }
}

export const productosService = {
  descartarImagen: borrarImagenLocal,

  async list({ activo, buscar, categoriaId, page, perPage }) {
    const { rows, total } = await productosRepo.list({ activo, buscar, categoriaId, limit: perPage, offset: (page - 1) * perPage });
    return paginated(rows, total, { page, perPage });
  },

  async get(id) {
    const producto = await productosRepo.findFull(id);
    if (!producto) throw notFound('El producto no existe.');
    return producto;
  },

  /**
   * @param {object} data       campos validados
   * @param {string|null} uploadedPath  ruta pública de la imagen subida (si hubo)
   */
  async create(data, uploadedPath) {
    if (await productosRepo.existsByName(data.nombre)) {
      await borrarImagenLocal(uploadedPath);
      throw conflict(`Ya existe un producto llamado "${data.nombre}".`);
    }
    await validarRelaciones(data);
    const imagen = uploadedPath || data.imagen_url || config.productPlaceholder;

    const id = await transaction(async () => {
      const newId = await productosRepo.insert({ nombre: data.nombre, descripcion: data.descripcion, precio: data.precio, imagen });
      await productosRepo.syncCategorias(newId, data.categoria_ids);
      await productosRepo.syncIngredientes(newId, data.ingredientes);
      return newId;
    });
    avisarCatalogo('productos');
    return productosRepo.findFull(id);
  },

  async update(id, data, uploadedPath) {
    const actual = await productosRepo.findById(id);
    if (!actual) {
      await borrarImagenLocal(uploadedPath);
      throw notFound('El producto no existe.');
    }
    if (await productosRepo.existsByName(data.nombre, { excludeId: id })) {
      await borrarImagenLocal(uploadedPath);
      throw conflict(`Ya existe otro producto llamado "${data.nombre}".`);
    }
    await validarRelaciones(data);

    // Imagen: archivo nuevo > URL > quitar (placeholder) > mantener.
    let imagen = actual.imagen;
    if (uploadedPath) imagen = uploadedPath;
    else if (data.imagen_url) imagen = data.imagen_url;
    else if (data.quitar_imagen) imagen = config.productPlaceholder;

    await transaction(async () => {
      await productosRepo.update(id, { nombre: data.nombre, descripcion: data.descripcion, precio: data.precio, imagen });
      await productosRepo.syncCategorias(id, data.categoria_ids);
      await productosRepo.syncIngredientes(id, data.ingredientes);
    });
    if (imagen !== actual.imagen) await borrarImagenLocal(actual.imagen);
    avisarCatalogo('productos');
    return productosRepo.findFull(id);
  },

  async deshabilitar(id) {
    const p = await this.get(id);
    await productosRepo.setActivo(id, false);
    avisarCatalogo('productos');
    return { ...p, activo: false };
  },

  async habilitar(id) {
    const p = await this.get(id);
    if (await productosRepo.existsByName(p.nombre, { excludeId: id, onlyActive: true })) {
      throw conflict(`No se puede habilitar: ya hay otro producto activo llamado "${p.nombre}".`);
    }
    await productosRepo.setActivo(id, true);
    avisarCatalogo('productos');
    return { ...p, activo: true };
  },
};

// ───────────── Catálogo público (kiosco y caja) ─────────────
export const catalogoService = {
  async productos({ categoriaId, buscar, orden, precioMin, precioMax, page, perPage }) {
    const { rows, total } = await productosRepo.list({
      activo: true,
      soloActivos: true,
      categoriaId,
      buscar,
      orden,
      precioMin,
      precioMax,
      limit: perPage,
      offset: (page - 1) * perPage,
    });
    return paginated(await conPrecios(rows), total, { page, perPage });
  },

  async producto(id) {
    const p = await productosRepo.findFull(id, { soloActivos: true });
    if (!p || !p.activo) throw notFound('El producto no está disponible.');
    return (await conPrecios([p]))[0];
  },

  async categorias() {
    return (await categoriasRepo.list({ activo: true })).rows;
  },
};

// ───────────── Promociones ─────────────
async function validarPromo(data, excludeId = 0) {
  if (data.codigo) {
    if (data.tipo_descuento !== 'monto') throw unprocessable('El código de cupón solo se permite en promociones de monto fijo.');
    if (await promocionesRepo.codigoEnUso(data.codigo, excludeId)) throw conflict(`Ya hay otra promoción activa con el código "${data.codigo}".`);
  }
  if (data.fecha_inicio && data.fecha_fin && data.fecha_fin < data.fecha_inicio) {
    throw unprocessable('La fecha de fin debe ser igual o posterior a la de inicio.');
  }
  if (data.tipo_descuento === 'porcentaje' && data.descuento > 100) throw unprocessable('El porcentaje no puede superar 100.');
  if (data.productos.length) {
    const found = await productosRepo.findManyByIds(data.productos);
    if (found.length !== data.productos.length) throw unprocessable('Alguno de los productos seleccionados no existe.');
  }
}

const promoRecord = (d) => ({
  nombre: d.nombre,
  tipo_descuento: d.tipo_descuento,
  descuento: d.descuento,
  codigo: d.tipo_descuento === 'monto' && d.codigo ? d.codigo.toUpperCase() : null,
  fecha_inicio: d.fecha_inicio || null,
  fecha_fin: d.fecha_fin || null,
});

const CUPONES_APAGADOS = 'Los cupones con código no están incluidos en el paquete contratado: solo se pueden crear promociones automáticas.';
/** Con el módulo de cupones apagado no se pueden crear, editar ni habilitar promociones con código. */
const exigirCupones = (codigo) => {
  if (codigo && !moduloActivo('cupones')) throw conflict(CUPONES_APAGADOS);
};

/** Deshabilita todos los cupones (promociones con código): se usa al apagar el módulo. */
export async function deshabilitarCupones() {
  const n = await promocionesRepo.deshabilitarConCodigo();
  if (n) avisarCatalogo('promociones');
  return n;
}

export const promocionesService = {
  async list({ activo, buscar, page, perPage }) {
    await promocionesRepo.deactivateExpired(today());
    const { rows, total } = await promocionesRepo.list({ activo, buscar, limit: perPage, offset: (page - 1) * perPage });
    return paginated(rows, total, { page, perPage });
  },

  async get(id) {
    const promo = await promocionesRepo.findById(id);
    if (!promo) throw notFound('La promoción no existe.');
    return { ...promo, productos: await promocionesRepo.productos(id) };
  },

  async create(data) {
    if (await promocionesRepo.existsByName(data.nombre)) throw conflict(`Ya existe una promoción llamada "${data.nombre}".`);
    exigirCupones(promoRecord(data).codigo);
    await validarPromo(data);
    const id = await transaction(async () => {
      const newId = await promocionesRepo.insert(promoRecord(data));
      await promocionesRepo.syncProductos(newId, data.productos);
      return newId;
    });
    avisarCatalogo('promociones');
    return this.get(id);
  },

  async update(id, data) {
    await this.get(id);
    if (await promocionesRepo.existsByName(data.nombre, { excludeId: id })) throw conflict(`Ya existe otra promoción llamada "${data.nombre}".`);
    exigirCupones(promoRecord(data).codigo);
    await validarPromo(data, id);
    await transaction(async () => {
      await promocionesRepo.update(id, promoRecord(data));
      await promocionesRepo.syncProductos(id, data.productos);
    });
    avisarCatalogo('promociones');
    return this.get(id);
  },

  async deshabilitar(id) {
    const promo = await this.get(id);
    await promocionesRepo.setActivo(id, false);
    avisarCatalogo('promociones');
    return { ...promo, activo: false };
  },

  async habilitar(id) {
    const promo = await this.get(id);
    if (promo.fecha_fin && promo.fecha_fin < today()) throw conflict('No se puede habilitar: la promoción ya venció. Editá la fecha de fin primero.');
    exigirCupones(promo.codigo);
    if (await promocionesRepo.existsByName(promo.nombre, { excludeId: id, onlyActive: true })) {
      throw conflict(`No se puede habilitar: ya hay otra promoción activa llamada "${promo.nombre}".`);
    }
    if (promo.codigo && (await promocionesRepo.codigoEnUso(promo.codigo, id))) {
      throw conflict(`No se puede habilitar: el código "${promo.codigo}" ya lo usa otra promoción activa.`);
    }
    await promocionesRepo.setActivo(id, true);
    avisarCatalogo('promociones');
    return { ...promo, activo: true };
  },
};

// ───────────── Reglas de puntos ─────────────
async function validarTramo({ monto_min, monto_max }, excludeId = 0) {
  if (monto_max <= monto_min) throw unprocessable('El monto máximo debe ser mayor que el mínimo.');
  const overlap = await reglasPuntosRepo.findOverlap(monto_min, monto_max, excludeId);
  if (overlap) {
    throw conflict(`El tramo se superpone con el existente $${overlap.monto_min} – $${overlap.monto_max}.`);
  }
}

export const reglasPuntosService = {
  list: () => reglasPuntosRepo.list(),

  async create(data) {
    await validarTramo(data);
    return reglasPuntosRepo.findById(await reglasPuntosRepo.insert(data));
  },

  async update(id, data) {
    if (!(await reglasPuntosRepo.findById(id))) throw notFound('La regla no existe.');
    await validarTramo(data, id);
    await reglasPuntosRepo.update(id, data);
    return reglasPuntosRepo.findById(id);
  },

  async remove(id) {
    if (!(await reglasPuntosRepo.delete(id))) throw notFound('La regla no existe.');
  },
};
