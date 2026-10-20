import crypto from 'node:crypto';
import { transaction } from '../db/connection.js';
import { clientesRepo, reglasPuntosRepo } from '../repositories/clientes.repository.js';
import { mesasRepo } from '../repositories/mesas.repository.js';
import { pedidosRepo } from '../repositories/pedidos.repository.js';
import { productosRepo } from '../repositories/productos.repository.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../utils/http-error.js';
import { today } from '../utils/dates.js';
import { publish } from '../websocket/realtime.js';
import { preciosVigentes, round2 } from './pricing.service.js';
import { toMesaDto, toSeguimientoDto } from './seguimiento.service.js';
import { buscarCupon, descuentoCupon } from './cupones.service.js';

export const ESTADOS_PEDIDO = ['Cancelado', 'Recibido', 'En Preparacion', 'Listo', 'Entregado', 'En Mesa'];
export const ESTADOS_PAGO = ['Completado', 'Pendiente', 'Fallido'];
export const METODOS_PAGO = ['Efectivo', 'Tarjeta'];
/** "Entregado" = retirado en el mostrador; "En Mesa" = el mozo lo llevó a la mesa. */
export const ENTREGADOS = ['Entregado', 'En Mesa'];
export const CERRADOS = [...ENTREGADOS, 'Cancelado'];
export const MAX_MESA = 999;

// Sin 0/O ni 1/I para que el código sea fácil de dictar y leer.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function generarCodigo() {
  for (let intento = 0; intento < 20; intento++) {
    const bytes = crypto.randomBytes(4);
    const codigo = `PED-${[...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join('')}`;
    if (!(await pedidosRepo.existsCodigo(codigo))) return codigo;
  }
  throw new Error('No se pudo generar un código de pedido único.');
}

/** Datos mínimos (y la cédula enmascarada) para la pantalla pública de llamados. */
export function toPublicDto(p) {
  return {
    id: p.id,
    codigo: p.codigo,
    estado: p.estado,
    updated_at: p.updated_at,
    cliente: p.cliente
      ? { nombre: p.cliente.nombre, apellido: p.cliente.apellido, cedula: `****${String(p.cliente.cedula).slice(-4)}` }
      : null,
  };
}

/**
 * Publica un evento de pedido a cada pantalla con los datos que le corresponden.
 * Los pedidos de mozo no van a la pantalla de llamados: avisan al mozo y a los celulares de la mesa.
 */
function publicarPedido(type, pedido) {
  const deMozo = pedido.origen === 'Mozo';
  const cambioVisible = type === 'pedido:estado' || type === 'pedido:actualizado';
  publish(type, {
    staff: pedido,
    publico: cambioVisible && !deMozo ? toPublicDto(pedido) : undefined,
    seguimiento: cambioVisible ? toSeguimientoDto(pedido) : undefined,
    mozo: deMozo ? { ...pedido, mozo_id: pedido.usuario.id } : undefined,
    mesa: pedido.mesa_abierta_id ? toMesaDto(pedido) : undefined,
  });
}

/**
 * ¿El producto se elabora en la cocina? Sí, salvo que alguna de sus categorías sea "sin cocina"
 * (bebidas, postres...): esos los prepara y entrega la caja.
 */
export const vaACocina = (producto) => (producto.categorias || []).every((c) => c.va_a_cocina !== false);

/** Máximo de unidades extra de un mismo ingrediente por producto. */
export const MAX_EXTRA = 3;

/**
 * Valida los ítems contra la base y calcula precios con promociones y extras.
 * La promoción automática se aplica al precio base; los extras se cobran aparte.
 * @param {{id:number, cantidad:number, quitados?:number[], extras?:{id:number,cantidad:number}[]}[]} items
 */
async function construirLineas(items) {
  const ids = [...new Set(items.map((i) => i.id))];
  const productos = await productosRepo.findManyByIds(ids);
  const porId = new Map(productos.map((p) => [p.id, p]));
  const precios = await preciosVigentes(productos);

  return items.map((item, idx) => {
    const producto = porId.get(item.id);
    if (!producto || !producto.activo) throw unprocessable(`El producto del ítem ${idx + 1} no existe o no está disponible.`);

    const ingredientesProducto = new Map(producto.ingredientes.map((i) => [i.id, i]));

    const quitados = [...new Set(item.quitados || [])];
    for (const ingId of quitados) {
      const ing = ingredientesProducto.get(ingId);
      if (!ing) throw unprocessable(`"${producto.nombre}" no lleva el ingrediente indicado para quitar.`);
      if (ing.es_obligatorio) throw unprocessable(`No se puede quitar "${ing.nombre}" de "${producto.nombre}" (es obligatorio).`);
    }

    // Extras: solo de ingredientes que el producto ya lleva y que tengan precio de extra.
    const extras = [];
    for (const ex of item.extras || []) {
      const ing = ingredientesProducto.get(ex.id);
      if (!ing) throw unprocessable(`"${producto.nombre}" no lleva el ingrediente indicado como extra.`);
      if (!ing.activo || ing.precio_extra == null) throw unprocessable(`"${ing.nombre}" no se puede pedir como extra.`);
      if (quitados.includes(ex.id)) throw unprocessable(`No se puede quitar y pedir extra de "${ing.nombre}" a la vez.`);
      if (extras.some((e) => e.id === ex.id)) throw unprocessable(`"${ing.nombre}" está repetido en los extras.`);
      if (ex.cantidad < 1 || ex.cantidad > MAX_EXTRA) throw unprocessable(`Se pueden agregar hasta ${MAX_EXTRA} extras de "${ing.nombre}".`);
      extras.push({ id: ex.id, cantidad: ex.cantidad, precio: Number(ing.precio_extra) });
    }
    const extrasUnidad = extras.reduce((s, e) => s + e.precio * e.cantidad, 0);

    const { descuento, precio_final } = precios.get(producto.id);
    return {
      producto_id: producto.id,
      cantidad: item.cantidad,
      precio_unitario: Number(producto.precio),
      descuento: round2(descuento * item.cantidad),
      subtotal: round2((precio_final + extrasUnidad) * item.cantidad),
      para_cocina: vaACocina(producto),
      quitados,
      extras,
    };
  });
}

/** Aplica (o no) un cupón y devuelve los campos del pedido relacionados. */
async function totalesConCupon(lineas, codigoCupon, ip) {
  const bruto = round2(lineas.reduce((s, l) => s + l.subtotal, 0));
  if (!codigoCupon) return { total: bruto, promocion_id: null, cupon_codigo: null, descuento_cupon: 0 };
  const cupon = await buscarCupon(codigoCupon, { ip });
  const descuento = descuentoCupon(cupon, lineas);
  return { total: round2(bruto - descuento), promocion_id: cupon.id, cupon_codigo: cupon.codigo, descuento_cupon: descuento };
}

async function validarCliente(clienteId) {
  if (!clienteId) return null;
  const cliente = await clientesRepo.findById(clienteId);
  if (!cliente) throw unprocessable('El cliente indicado no existe.');
  if (!cliente.activo) throw unprocessable('El cliente indicado está inactivo.');
  return cliente.id;
}

/**
 * mesa: solo pedidos de mozo. enviarACocina: el pedido pasa directo a "En Preparacion".
 */
export async function crearPedido({ usuario, clienteId = null, items, metodoPago, origen, mesa = null, enviarACocina = false, codigoCupon = null, ip }) {
  if (!items?.length) throw badRequest('El pedido debe tener al menos un producto.');
  if (origen === 'Mozo' && !mesa) throw unprocessable('Indicá el número de mesa.');
  // El pedido del mozo queda en la mesa abierta (si no estaba abierta, se abre ahora).
  const apertura = origen === 'Mozo' ? await abrirMesa({ mozo: usuario, numero: mesa }) : null;

  const pedidoId = await transaction(async () => {
    const lineas = await construirLineas(items);
    const totales = await totalesConCupon(lineas, codigoCupon, ip);
    const total = totales.total;
    const id = await pedidosRepo.insert({
      usuario_id: usuario.id,
      cliente_id: await validarCliente(clienteId),
      origen,
      mesa: apertura?.numero ?? null,
      mesa_abierta_id: apertura?.id ?? null,
      metodo_pago: metodoPago,
      estado: 'Recibido',
      codigo: await generarCodigo(),
      ...totales,
    });
    for (const l of lineas) await pedidosRepo.insertDetalle({ pedido_id: id, ...l });
    await pedidosRepo.insertPago({ pedido_id: id, tipo: metodoPago, monto: total, estado: 'Pendiente' });
    return id;
  });

  const pedido = await pedidosRepo.findById(pedidoId);
  publicarPedido('pedido:creado', pedido);
  // Si no tiene nada para elaborar (solo bebidas, postres...) queda en la caja.
  return enviarACocina && pedido.requiere_cocina ? cambiarEstado(pedidoId, 'En Preparacion') : pedido;
}

/**
 * @param {string|null|undefined} codigoCupon  undefined = mantener el cupón actual; null = quitarlo
 */
export async function actualizarPedido(id, { items, metodoPago, clienteId, codigoCupon, mesa, ip }) {
  await transaction(async () => {
    const actual = await pedidosRepo.findById(id, { withDetalles: false, forUpdate: true });
    if (!actual) throw notFound('Pedido no encontrado.');
    if (CERRADOS.includes(actual.estado)) throw conflict(`No se puede editar un pedido ${actual.estado.toLowerCase()}.`);

    const lineas = await construirLineas(items);
    let totales;
    if (codigoCupon === undefined && actual.cupon) {
      // Se mantiene el cupón que ya tenía; si venció o ya no aplica, se quita sin frenar la edición.
      totales = await totalesConCupon(lineas, actual.cupon.codigo, ip).catch(() => totalesConCupon(lineas, null));
    } else {
      totales = await totalesConCupon(lineas, codigoCupon ?? null, ip);
    }
    const total = totales.total;
    await pedidosRepo.deleteDetalles(id);
    for (const l of lineas) await pedidosRepo.insertDetalle({ pedido_id: id, ...l });

    const cambios = { ...totales, metodo_pago: metodoPago };
    if (clienteId !== undefined) cambios.cliente_id = await validarCliente(clienteId);
    if (mesa && actual.origen === 'Mozo' && mesa !== actual.mesa) {
      const apertura = await abrirMesa({ mozo: actual.usuario, numero: mesa });
      Object.assign(cambios, { mesa: apertura.numero, mesa_abierta_id: apertura.id });
    }
    // Si al editar ya no queda nada para elaborar, sale de la cocina y vuelve a la caja.
    if (actual.estado === 'En Preparacion' && !lineas.some((l) => l.para_cocina)) cambios.estado = 'Recibido';
    await pedidosRepo.update(id, cambios);
    await pedidosRepo.updatePago(id, { monto: total, tipo: metodoPago });
  });

  const pedido = await pedidosRepo.findById(id);
  publicarPedido('pedido:actualizado', pedido);
  return pedido;
}

/** Otorga puntos (una sola vez) según la tabla de reglas. */
async function otorgarPuntos(pedido) {
  if (!pedido.cliente || (await pedidosRepo.existePuntos(pedido.id))) return 0;
  const regla = await reglasPuntosRepo.findByTotal(pedido.total);
  const puntos = regla ? regla.puntos_base : 1;
  await pedidosRepo.insertPuntos({ cliente_id: pedido.cliente.id, pedido_id: pedido.id, cantidad: puntos });
  await clientesRepo.addPuntos(pedido.cliente.id, puntos);
  return puntos;
}

export async function cambiarEstado(id, estado, { completarPago = false } = {}) {
  if (!ESTADOS_PEDIDO.includes(estado)) throw unprocessable('Estado inválido.');

  await transaction(async () => {
    const pedido = await pedidosRepo.findById(id, { withDetalles: false, forUpdate: true });
    if (!pedido) throw notFound('Pedido no encontrado.');
    if (estado === 'En Mesa' && pedido.origen !== 'Mozo') throw unprocessable('Solo los pedidos tomados por un mozo pueden quedar "En mesa".');
    if (estado === 'En Preparacion' && !pedido.requiere_cocina) {
      throw unprocessable('Este pedido no tiene nada para la cocina: lo prepara y entrega la caja.');
    }
    await pedidosRepo.update(id, { estado });
    if (ENTREGADOS.includes(estado)) {
      await otorgarPuntos(pedido);
      if (completarPago && pedido.pago?.estado !== 'Completado') await pedidosRepo.updatePago(id, { estado: 'Completado' });
    }
  });

  const pedido = await pedidosRepo.findById(id);
  publicarPedido('pedido:estado', pedido);
  return pedido;
}

export async function cambiarEstadoPago(pedidoId, estado) {
  if (!ESTADOS_PAGO.includes(estado)) throw unprocessable('Estado de pago inválido.');
  const pedido = await pedidosRepo.findById(pedidoId, { withDetalles: false });
  if (!pedido?.pago) throw notFound('Pago no encontrado.');
  await pedidosRepo.updatePago(pedidoId, { estado });
  const actualizado = await pedidosRepo.findById(pedidoId);
  publicarPedido('pago:estado', actualizado);
  return actualizado;
}

/** Cobro registrado por el mozo: fija el método (efectivo/tarjeta) y deja el pago completado. */
export async function registrarCobro(pedidoId, metodoPago) {
  if (!METODOS_PAGO.includes(metodoPago)) throw unprocessable('Método de pago inválido.');
  await transaction(async () => {
    const pedido = await pedidosRepo.findById(pedidoId, { withDetalles: false, forUpdate: true });
    if (!pedido?.pago) throw notFound('Pago no encontrado.');
    if (pedido.estado === 'Cancelado') throw conflict('El pedido está cancelado.');
    await pedidosRepo.update(pedidoId, { metodo_pago: metodoPago });
    await pedidosRepo.updatePago(pedidoId, { tipo: metodoPago, estado: 'Completado' });
  });
  const actualizado = await pedidosRepo.findById(pedidoId);
  publicarPedido('pago:estado', actualizado);
  return actualizado;
}

export async function obtenerPedido(id) {
  const pedido = await pedidosRepo.findById(id);
  if (!pedido) throw notFound('Pedido no encontrado.');
  return pedido;
}

/** Pedidos del día para la caja. vista: 'activos' (no entregados) | 'entregados' | 'todos' */
export function listarPedidosCaja({ vista = 'activos', search, page, perPage }) {
  const opts = { fecha: today(), search, limit: perPage, offset: (page - 1) * perPage };
  if (vista === 'activos') Object.assign(opts, { excluirEstados: CERRADOS });
  if (vista === 'entregados') Object.assign(opts, { estados: ENTREGADOS, fechaCampo: 'updated_at' });
  if (vista === 'cancelados') Object.assign(opts, { estados: ['Cancelado'] });
  return pedidosRepo.list(opts);
}

export async function listarPedidosCocina({ order = 'asc' } = {}) {
  const { rows } = await pedidosRepo.list({ estados: ['En Preparacion'], order, withDetalles: true });
  return rows.filter((p) => p.requiere_cocina);
}

/** Pantalla pública: pedidos de hoy en preparación y listos para retirar. */
export async function listarLlamados() {
  const hoy = today();
  const [preparando, listos] = await Promise.all([
    pedidosRepo.list({ estados: ['En Preparacion'], fecha: hoy, order: 'asc', excluirOrigen: 'Mozo' }),
    pedidosRepo.list({ estados: ['Listo'], fecha: hoy, fechaCampo: 'updated_at', excluirOrigen: 'Mozo' }),
  ]);
  return { preparando: preparando.rows.map(toPublicDto), listos: listos.rows.map(toPublicDto) };
}

// ───────────── Mozos ─────────────

const nuevoCodigoMesa = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

/**
 * Abre una mesa (aunque todavía no tenga pedidos) o devuelve la que ya tiene abierta ese mozo.
 * El número es único entre las mesas abiertas: si la atiende otro mozo, error.
 */
export async function abrirMesa({ mozo, numero }) {
  const id = await transaction(async () => {
    const abierta = await mesasRepo.findAbiertaPorNumero(numero, { forUpdate: true });
    if (abierta) {
      if (abierta.mozo.id !== mozo.id) throw conflict(`La mesa ${numero} ya la atiende ${abierta.mozo.nombre}.`);
      return abierta.id;
    }
    return mesasRepo.abrir({ mozoId: mozo.id, numero, codigo: nuevoCodigoMesa() });
  });
  return mesasRepo.findById(id);
}

/** Mesas abiertas con sus pedidos: [{ id, mesa, codigo, mozo, pedidos, total, pendiente }]. mozoId null = todas. */
export async function listarMesas({ mozoId = null, aperturas } = {}) {
  const mesas = aperturas ?? (await mesasRepo.listAbiertas({ mozoId }));
  const pedidos = await pedidosRepo.deAperturas(mesas.map((m) => m.id));
  return mesas.map((m) => {
    const propios = pedidos.filter((p) => p.mesa_abierta_id === m.id);
    return {
      id: m.id,
      mesa: m.numero,
      codigo: m.codigo,
      abierta_at: m.abierta_at,
      mozo: m.mozo,
      pedidos: propios,
      total: round2(propios.reduce((s, p) => s + p.total, 0)),
      pendiente: round2(propios.filter((p) => p.pago?.estado !== 'Completado').reduce((s, p) => s + p.total, 0)),
    };
  });
}

/** Mesa abierta de un mozo por número (404 si no la tiene abierta). */
async function mesaDelMozo(mozoId, numero) {
  const abierta = await mesasRepo.findAbiertaPorNumero(numero);
  if (!abierta || abierta.mozo.id !== mozoId) throw notFound(`No tenés la mesa ${numero} abierta.`);
  return abierta;
}

/** Pedido tomado por este mozo (el administrador puede ver los de cualquier mozo). */
export async function pedidoDelMozo(id, usuario, { withDetalles = true } = {}) {
  const pedido = await pedidosRepo.findById(id, { withDetalles });
  if (!pedido || pedido.origen !== 'Mozo') throw notFound('Pedido no encontrado.');
  if (usuario.rol !== 'Administrador' && pedido.usuario.id !== usuario.id) throw forbidden('Este pedido lo tomó otro mozo.');
  return pedido;
}

/**
 * Libera una mesa cuando los clientes ya pagaron y se fueron: lo que quedó sin marcar
 * (listo, en preparación, despachado por la caja...) pasa a "En Mesa", la mesa se cierra
 * y los celulares que la seguían pierden el acceso.
 * @param {{aperturaId?: number, mozoId?: number, numero?: number}} opts
 */
export async function liberarMesa({ aperturaId, mozoId, numero }) {
  const apertura = aperturaId ? await mesasRepo.findById(aperturaId) : await mesaDelMozo(mozoId, numero);
  if (!apertura?.abierta) throw notFound('La mesa ya está libre.');
  const [mesa] = await listarMesas({ aperturas: [apertura] });
  if (mesa.pendiente > 0) {
    throw conflict(`La mesa ${mesa.mesa} todavía debe ${mesa.pendiente.toFixed(2)}. Cobrala antes de liberarla.`, { pendiente: mesa.pendiente });
  }
  const abiertos = mesa.pedidos.filter((p) => !ENTREGADOS.includes(p.estado));
  for (const p of abiertos) await cambiarEstado(p.id, 'En Mesa');
  await mesasRepo.cerrar(apertura.id);
  const aviso = { id: apertura.id, mesa: apertura.numero, mozo_id: apertura.mozo.id };
  publish('mesa:liberada', { staff: aviso, mozo: aviso, mesa: { mesa_abierta_id: apertura.id } });
  return { mesa: apertura.numero, liberados: abiertos.length };
}

/** Cobra de una vez todo lo pendiente de una mesa del mozo. */
export async function cobrarMesa({ usuario, mesa: numero, metodoPago }) {
  const apertura = await mesaDelMozo(usuario.id, numero);
  const [mesa] = await listarMesas({ aperturas: [apertura] });
  const pendientes = mesa.pedidos.filter((p) => p.pago?.estado !== 'Completado');
  if (!pendientes.length) throw conflict(`La mesa ${numero} no tiene nada pendiente de cobro.`);
  for (const p of pendientes) await registrarCobro(p.id, metodoPago);
  return { mesa: numero, cobrados: pendientes.length, total: round2(pendientes.reduce((s, p) => s + p.total, 0)) };
}
