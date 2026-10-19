import { catalogoService } from '../services/admin.services.js';
import { clientesService } from '../services/clientes.service.js';
import { buscarCupon, cuponPublico } from '../services/cupones.service.js';
import {
  ESTADOS_PAGO,
  MAX_EXTRA,
  ESTADOS_PEDIDO,
  METODOS_PAGO,
  actualizarPedido,
  cambiarEstado,
  cambiarEstadoPago,
  crearPedido,
  listarLlamados,
  listarPedidosCaja,
  listarPedidosCocina,
  obtenerPedido,
} from '../services/pedidos.service.js';
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
