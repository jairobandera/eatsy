import { catalogoService } from '../services/admin.services.js';
import { clientesService } from '../services/clientes.service.js';
import { buscarCupon, cuponPublico } from '../services/cupones.service.js';
import {
  ESTADOS_PAGO,
  MAX_EXTRA,
  ESTADOS_PEDIDO,
  MAX_MESA,
  METODOS_PAGO,
  actualizarPedido,
  cambiarEstado,
  cambiarEstadoPago,
  cobrarMesa,
  crearPedido,
  listarLlamados,
  abrirMesa,
  liberarMesa,
  listarMesas,
  listarPedidosCaja,
  listarPedidosCocina,
  obtenerPedido,
  pedidoDelMozo,
  registrarCobro,
} from '../services/pedidos.service.js';
import { conflict } from '../utils/http-error.js';
import { esTotem } from '../services/config.service.js';
import { despacharPedidoTotem, entregarPedidoTotem } from '../services/pedidos.service.js';
import { pagination, paginated, parseId, validate } from '../utils/validator.js';
import { optionalNumber } from './helpers.js';

const itemsSchema = {
  type: 'array',
  required: true,
  min: 1,
  minMessage: 'El pedido debe tener al menos un producto.',
  items: {
    type: 'object',
    schema: {
      id: { type: 'integer', required: true, min: 1, label: 'producto' },
      cantidad: { type: 'integer', required: true, min: 1, max: 99 },
      quitados: { type: 'array', default: [], unique: true, items: { type: 'integer', min: 1 } },
      extras: {
        type: 'array',
        default: [],
        items: { type: 'object', schema: { id: { type: 'integer', required: true, min: 1 }, cantidad: { type: 'integer', required: true, min: 1, max: MAX_EXTRA } } },
      },
    },
  },
};

const cuponSchema = { type: 'string', maxLength: 30, label: 'código de descuento' };

const pedidoSchema = {
  items: itemsSchema,
  metodo_pago: { type: 'enum', required: true, values: METODOS_PAGO, label: 'método de pago' },
  cliente_id: { type: 'integer', min: 1, label: 'cliente' },
  codigo_cupon: cuponSchema,
};

// ───────────── Catálogo (kiosco y caja) ─────────────
export const catalogoController = {
  productos: async (req, res) => {
    const { page, perPage } = pagination(req.query, 12, 48);
    res.json(
      await catalogoService.productos({
        categoriaId: optionalNumber(req.query.categoria_id),
        buscar: String(req.query.buscar || '').slice(0, 100),
        orden: req.query.orden,
        precioMin: optionalNumber(req.query.precio_min),
        precioMax: optionalNumber(req.query.precio_max),
        page,
        perPage,
      }),
    );
  },
  producto: async (req, res) => res.json(await catalogoService.producto(parseId(req.params.id))),
  categorias: async (_req, res) => res.json(await catalogoService.categorias()),
  /** Valida un código de descuento antes de confirmar el pedido. */
  cupon: async (req, res) => {
    const { codigo } = validate(req.body, { codigo: { ...cuponSchema, required: true } });
    res.json(cuponPublico(await buscarCupon(codigo, { ip: req.ip })));
  },
};

// ───────────── Caja ─────────────
export const cajaController = {
  list: async (req, res) => {
    const { page, perPage } = pagination(req.query, 10, 50);
    const vista = ['activos', 'entregados', 'cancelados'].includes(req.query.vista) ? req.query.vista : 'activos';
    const search = String(req.query.search || '').trim().slice(0, 50);
    const { rows, total } = await listarPedidosCaja({ vista, search, page, perPage });
    res.json(paginated(rows, total, { page, perPage }));
  },

  get: async (req, res) => res.json(await obtenerPedido(parseId(req.params.id))),

  create: async (req, res) => {
    const data = validate(req.body, pedidoSchema);
    const pedido = await crearPedido({
      usuario: req.user,
      clienteId: data.cliente_id,
      items: data.items,
      metodoPago: data.metodo_pago,
      origen: 'Caja',
      codigoCupon: data.codigo_cupon,
      ip: req.ip,
    });
    res.status(201).json(pedido);
  },

  update: async (req, res) => {
    const data = validate(req.body, pedidoSchema);
    const clienteId = 'cliente_id' in req.body ? data.cliente_id : undefined;
    const codigoCupon = 'codigo_cupon' in req.body ? data.codigo_cupon : undefined;
    res.json(await actualizarPedido(parseId(req.params.id), { items: data.items, metodoPago: data.metodo_pago, clienteId, codigoCupon, ip: req.ip }));
  },

  estado: async (req, res) => {
    const data = validate(req.body, {
      estado: { type: 'enum', required: true, values: ESTADOS_PEDIDO },
      completar_pago: { type: 'boolean', default: false },
    });
    res.json(await cambiarEstado(parseId(req.params.id), data.estado, { completarPago: data.completar_pago }));
  },

  pago: async (req, res) => {
    const { estado } = validate(req.body, { estado: { type: 'enum', required: true, values: ESTADOS_PAGO } });
    res.json(await cambiarEstadoPago(parseId(req.params.id), estado));
  },

  /** Cobro con método (efectivo/tarjeta): lo usa la caja para los pedidos de mesa. */
  cobrar: async (req, res) => {
    const { metodo_pago } = validate(req.body, { metodo_pago: pedidoSchema.metodo_pago });
    res.json(await registrarCobro(parseId(req.params.id), metodo_pago));
  },
};

// ───────────── Kiosco (autoservicio) ─────────────
export const kioscoController = {
  create: async (req, res) => {
    const data = validate(req.body, { items: itemsSchema, metodo_pago: pedidoSchema.metodo_pago, codigo_cupon: cuponSchema });
    const pedido = await crearPedido({
      usuario: req.user,
      items: data.items,
      metodoPago: data.metodo_pago,
      origen: 'Kiosco',
      codigoCupon: data.codigo_cupon,
      ip: req.ip,
    });
    // Tótem: no hay caja que lo mande a la cocina.
    if (esTotem()) await despacharPedidoTotem(pedido);
    res.status(201).json({
      id: pedido.id,
      codigo: pedido.codigo,
      total: pedido.total,
      metodo_pago: pedido.metodo_pago,
      created_at: pedido.created_at,
      cupon: pedido.cupon,
      detalles: pedido.detalles,
    });
  },
};

// ───────────── Cocina ─────────────
export const cocinaController = {
  list: async (req, res) => res.json(await listarPedidosCocina({ order: req.query.order === 'desc' ? 'desc' : 'asc' })),
  get: async (req, res) => res.json(await obtenerPedido(parseId(req.params.id))),
  listo: async (req, res) => res.json(await cambiarEstado(parseId(req.params.id), 'Listo')),
  /** Solo Tótem: el cliente retiró el pedido. */
  entregar: async (req, res) => res.json(await entregarPedidoTotem(parseId(req.params.id))),
};

// ───────────── Mozo (pedidos por mesa) ─────────────
const mesaSchema = { type: 'integer', required: true, min: 1, max: MAX_MESA, label: 'mesa' };
const metodoSchema = { metodo_pago: pedidoSchema.metodo_pago };
const mesaParam = (req) => validate({ mesa: req.params.mesa }, { mesa: mesaSchema }).mesa;

export const mozoController = {
  /** Mesas abiertas del mozo (el administrador ve las de todos). */
  mesas: async (req, res) => res.json(await listarMesas({ mozoId: req.user.rol === 'Administrador' ? null : req.user.id })),

  get: async (req, res) => res.json(await pedidoDelMozo(parseId(req.params.id), req.user)),

  /** Abre una mesa vacía (cuando se sienta un cliente): genera el código para su celular. */
  abrirMesa: async (req, res) => {
    const { mesa } = validate(req.body, { mesa: mesaSchema });
    res.status(201).json(await abrirMesa({ mozo: req.user, numero: mesa }));
  },

  /** El pedido del mozo va directo a la cocina (y aparece en la caja). */
  create: async (req, res) => {
    const data = validate(req.body, { mesa: mesaSchema, items: itemsSchema, codigo_cupon: cuponSchema });
    const pedido = await crearPedido({
      usuario: req.user,
      items: data.items,
      metodoPago: 'Efectivo', // se confirma al cobrar
      origen: 'Mozo',
      mesa: data.mesa,
      enviarACocina: true,
      codigoCupon: data.codigo_cupon,
      ip: req.ip,
    });
    res.status(201).json(pedido);
  },

  update: async (req, res) => {
    const actual = await pedidoDelMozo(parseId(req.params.id), req.user, { withDetalles: false });
    const data = validate(req.body, { mesa: mesaSchema, items: itemsSchema, codigo_cupon: cuponSchema });
    const codigoCupon = 'codigo_cupon' in req.body ? data.codigo_cupon : undefined;
    res.json(await actualizarPedido(actual.id, { items: data.items, metodoPago: actual.metodo_pago, mesa: data.mesa, codigoCupon, ip: req.ip }));
  },

  /** El mozo solo marca que llevó el pedido a la mesa. */
  enMesa: async (req, res) => {
    const pedido = await pedidoDelMozo(parseId(req.params.id), req.user, { withDetalles: false });
    if (pedido.estado === 'Cancelado') throw conflict('El pedido está cancelado.');
    res.json(await cambiarEstado(pedido.id, 'En Mesa'));
  },

  cobrar: async (req, res) => {
    const pedido = await pedidoDelMozo(parseId(req.params.id), req.user, { withDetalles: false });
    const { metodo_pago } = validate(req.body, metodoSchema);
    res.json(await registrarCobro(pedido.id, metodo_pago));
  },

  cobrarMesa: async (req, res) => {
    const { metodo_pago } = validate(req.body, metodoSchema);
    res.json(await cobrarMesa({ usuario: req.user, mesa: mesaParam(req), metodoPago: metodo_pago }));
  },

  /** Los clientes pagaron y se fueron: la mesa queda libre. */
  liberarMesa: async (req, res) => res.json(await liberarMesa({ mozoId: req.user.id, numero: mesaParam(req) })),
};

/** La caja ve las mesas de todos los mozos y también puede liberarlas. */
export const cajaMesasController = {
  list: async (_req, res) => res.json(await listarMesas()),
  liberar: async (req, res) => res.json(await liberarMesa({ aperturaId: parseId(req.params.id) })),
  cobrar: async (req, res) => {
    const { metodo_pago } = validate(req.body, metodoSchema);
    res.json(await cobrarMesa({ aperturaId: parseId(req.params.id), metodoPago: metodo_pago }));
  },
};

// ───────────── Pantalla pública de llamados ─────────────
export const publicoController = {
  llamados: async (_req, res) => res.json(await listarLlamados()),
};

// ───────────── Clientes (caja) ─────────────
const clienteSchema = {
  cedula: { type: 'string', required: true, maxLength: 20, pattern: /^[0-9.\-]+$/, patternMessage: 'La cédula solo puede tener números, puntos o guiones.', label: 'cédula' },
  nombre: { type: 'string', required: true, maxLength: 50 },
  apellido: { type: 'string', required: true, maxLength: 50 },
  telefono: { type: 'string', maxLength: 20, label: 'teléfono' },
};

const limpiarCedula = (c) => String(c || '').replace(/[.\-\s]/g, '');

export const clientesController = {
  buscar: async (req, res) => res.json(await clientesService.buscar(limpiarCedula(req.query.cedula))),
  porCedula: async (req, res) => res.json(await clientesService.porCedula(limpiarCedula(req.params.cedula))),
  create: async (req, res) => {
    const data = validate(req.body, clienteSchema);
    res.status(201).json(await clientesService.create({ ...data, cedula: limpiarCedula(data.cedula) }));
  },
  update: async (req, res) => {
    const { cedula, ...schema } = clienteSchema;
    res.json(await clientesService.update(parseId(req.params.id), validate(req.body, schema)));
  },
};
