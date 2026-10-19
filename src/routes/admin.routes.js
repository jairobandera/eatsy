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
import { requireRole } from '../middlewares/auth.js';
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
crud(router, '/productos', productosController, { upload: uploadImagenProducto });
crud(router, '/promociones', promocionesController);

router.get('/reglas-puntos', reglasPuntosController.list);
router.post('/reglas-puntos', reglasPuntosController.create);
router.put('/reglas-puntos/:id', reglasPuntosController.update);
router.delete('/reglas-puntos/:id', reglasPuntosController.remove);

router.get('/estadisticas', getEstadisticas);

export default router;
