import { Router } from 'express';
import {
  categoriasController,
  getEstadisticas,
  ingredientesController,
  productosController,
  promocionesController,
  reglasPuntosController,
  usuariosController,
} from '../controllers/admin.controllers.js';
import { requireModulo, requireRole } from '../middlewares/auth.js';
import { qrMozo } from '../services/mesas.service.js';
import { parseId } from '../utils/validator.js';
import { uploadImagenProducto } from '../middlewares/upload.js';

/** Monta las rutas REST estándar de un recurso con baja lógica. */
function crud(router, path, ctrl, { upload } = {}) {
  const mw = upload ? [upload] : [];
  router.get(path, ctrl.list);
  router.get(`${path}/:id`, ctrl.get);
  router.post(path, ...mw, ctrl.create);
  router.put(`${path}/:id`, ...mw, ctrl.update);
  router.patch(`${path}/:id/deshabilitar`, ctrl.deshabilitar);
  router.patch(`${path}/:id/habilitar`, ctrl.habilitar);
}

const router = Router();
router.use(requireRole('Administrador'));

crud(router, '/categorias', categoriasController);
crud(router, '/ingredientes', ingredientesController);
crud(router, '/usuarios', usuariosController);
router.get('/usuarios/:id/qr', async (req, res) => res.json(await qrMozo(parseId(req.params.id))));
crud(router, '/productos', productosController, { upload: uploadImagenProducto });
crud(router, '/promociones', promocionesController);

const puntos = requireModulo('puntos');
router.get('/reglas-puntos', puntos, reglasPuntosController.list);
router.post('/reglas-puntos', puntos, reglasPuntosController.create);
router.put('/reglas-puntos/:id', puntos, reglasPuntosController.update);
router.delete('/reglas-puntos/:id', puntos, reglasPuntosController.remove);

router.get('/estadisticas', requireModulo('estadisticas'), getEstadisticas);

export default router;
