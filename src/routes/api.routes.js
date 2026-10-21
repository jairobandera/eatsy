import express, { Router } from 'express';
import { getInfo, getMe, postLogin, postLogout } from '../controllers/auth.controller.js';
import {
  cajaController,
  cajaMesasController,
  catalogoController,
  clientesController,
  cocinaController,
  kioscoController,
  mozoController,
  publicoController,
} from '../controllers/pedidos.controllers.js';
import { mesaController } from '../controllers/mesa.controller.js';
import { requireModulo, requireRole } from '../middlewares/auth.js';
import { negocioPublico } from '../controllers/superadmin.controller.js';
import superadminRoutes from './superadmin.routes.js';
import { qrSeguimiento, seguimientoController } from '../controllers/seguimiento.controller.js';
import { forbidden } from '../utils/http-error.js';
import config from '../config/index.js';
import { sql } from '../db/connection.js';
import { notFoundApi } from '../middlewares/error-handler.js';
import { csrfGuard } from '../middlewares/security.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.use(express.json({ limit: '200kb' }));
router.use(csrfGuard);

// Respuestas de la API nunca se cachean.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// ── Un celular que sigue su pedido solo puede usar la API de seguimiento (y la de mesas, si escanea un QR de mesa).
router.use((req, _res, next) => {
  if (!req.user && req.seguimientoId && !req.path.startsWith('/seguimiento') && !req.path.startsWith('/mesa')) {
    return next(forbidden('Desde este dispositivo solo podés ver el estado de tu pedido.'));
  }
  next();
});

// ── Seguimiento del pedido desde el celular del cliente
const seguimiento = requireModulo('seguimiento');
router.post('/seguimiento', seguimiento, seguimientoController.iniciar);
router.get('/seguimiento', seguimiento, seguimientoController.ver);
router.delete('/seguimiento', seguimientoController.salir);
router.get('/publico/seguimiento-qr', seguimiento, qrSeguimiento);

// ── Marca y funciones del negocio (lo lee cualquier pantalla, también sin sesión)
router.get('/publico/negocio', negocioPublico);

// ── Superadmin (oculto: para cualquier otro responde como ruta inexistente)
router.use('/superadmin', superadminRoutes);

// ── Celular del cliente en una mesa (QR del mozo + código de la mesa): ver sus pedidos y llamar al mozo
router.get('/mesa', mesaController.actual);
router.delete('/mesa', mesaController.salir);
router.post('/mesa/llamar', mesaController.llamar);
router.get('/mesa/:token', mesaController.info);
router.post('/mesa/:token/ingresar', mesaController.ingresar);

// ── Salud (lo usa Render/Docker para saber si la app y la base responden)
router.get('/salud', async (_req, res) => {
  try {
    await sql.get('SELECT 1 AS ok');
    res.json({ ok: true, modo: config.appMode });
  } catch {
    res.status(503).json({ ok: false, error: 'Sin conexión a la base de datos' });
  }
});

// ── Autenticación
router.post('/auth/login', postLogin);
router.post('/auth/logout', postLogout);
router.get('/auth/me', getMe);
router.get('/auth/info', getInfo);

// ── Público (pantalla de llamados)
router.get('/publico/llamados', publicoController.llamados);

// ── Catálogo: kiosco y caja
const catalogo = Router();
catalogo.use(requireRole('Cliente', 'Cajero', 'Mozo'));
catalogo.get('/categorias', catalogoController.categorias);
catalogo.get('/productos', catalogoController.productos);
catalogo.get('/productos/:id', catalogoController.producto);
catalogo.post('/cupon', requireModulo('cupones'), catalogoController.cupon);
router.use('/catalogo', catalogo);

// ── Kiosco
router.post('/kiosco/pedidos', requireRole('Cliente'), kioscoController.create);

// ── Caja
const caja = Router();
caja.use(requireRole('Cajero'));
caja.get('/pedidos', cajaController.list);
caja.get('/pedidos/:id', cajaController.get);
caja.post('/pedidos', cajaController.create);
caja.put('/pedidos/:id', cajaController.update);
caja.patch('/pedidos/:id/estado', cajaController.estado);
caja.patch('/pedidos/:id/pago', cajaController.pago);
caja.patch('/pedidos/:id/cobrar', cajaController.cobrar);
caja.get('/mesas', cajaMesasController.list);
caja.post('/mesas/:id/liberar', cajaMesasController.liberar);
caja.post('/mesas/:id/cobrar', cajaMesasController.cobrar);
caja.get('/clientes', clientesController.buscar);
caja.get('/clientes/cedula/:cedula', clientesController.porCedula);
caja.post('/clientes', clientesController.create);
caja.put('/clientes/:id', clientesController.update);
router.use('/caja', caja);

// ── Cocina
const cocina = Router();
cocina.use(requireRole('Cocina'));
cocina.get('/pedidos', cocinaController.list);
cocina.get('/pedidos/:id', cocinaController.get);
cocina.patch('/pedidos/:id/listo', cocinaController.listo);
cocina.patch('/pedidos/:id/entregar', cocinaController.entregar);
router.use('/cocina', cocina);

// ── Mozo
const mozo = Router();
mozo.use(requireRole('Mozo'));
mozo.get('/mesas', mozoController.mesas);
mozo.post('/mesas', mozoController.abrirMesa);
mozo.post('/mesas/:mesa/cobrar', mozoController.cobrarMesa);
mozo.post('/mesas/:mesa/liberar', mozoController.liberarMesa);
mozo.get('/pedidos/:id', mozoController.get);
mozo.post('/pedidos', mozoController.create);
mozo.put('/pedidos/:id', mozoController.update);
mozo.patch('/pedidos/:id/en-mesa', mozoController.enMesa);
mozo.patch('/pedidos/:id/cobrar', mozoController.cobrar);
router.use('/mozo', mozo);

// ── Administración
router.use('/admin', adminRoutes);

router.use(notFoundApi);

export default router;
