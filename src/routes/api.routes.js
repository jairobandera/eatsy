import express, { Router } from 'express';
import { getMe, postLogin, postLogout } from '../controllers/auth.controller.js';
import {
  cajaController,
  catalogoController,
  clientesController,
  cocinaController,
  kioscoController,
  publicoController,
} from '../controllers/pedidos.controllers.js';
import { requireRole } from '../middlewares/auth.js';
import { qrSeguimiento, seguimientoController } from '../controllers/seguimiento.controller.js';
import { forbidden } from '../utils/http-error.js';
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

// ── Un celular que sigue su pedido solo puede usar la API de seguimiento.
router.use((req, _res, next) => {
  if (!req.user && req.seguimientoId && !req.path.startsWith('/seguimiento')) {
    return next(forbidden('Desde este dispositivo solo podés ver el estado de tu pedido.'));
  }
  next();
});

// ── Seguimiento del pedido desde el celular del cliente
router.post('/seguimiento', seguimientoController.iniciar);
router.get('/seguimiento', seguimientoController.ver);
router.delete('/seguimiento', seguimientoController.salir);
router.get('/publico/seguimiento-qr', qrSeguimiento);

// ── Autenticación
router.post('/auth/login', postLogin);
router.post('/auth/logout', postLogout);
router.get('/auth/me', getMe);

// ── Público (pantalla de llamados)
router.get('/publico/llamados', publicoController.llamados);

// ── Catálogo: kiosco y caja
const catalogo = Router();
catalogo.use(requireRole('Cliente', 'Cajero'));
catalogo.get('/categorias', catalogoController.categorias);
catalogo.get('/productos', catalogoController.productos);
catalogo.get('/productos/:id', catalogoController.producto);
catalogo.post('/cupon', catalogoController.cupon);
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
router.use('/cocina', cocina);

// ── Administración
router.use('/admin', adminRoutes);

router.use(notFoundApi);

export default router;
