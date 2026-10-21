import { Router } from 'express';
import { superadminController } from '../controllers/superadmin.controller.js';
import { notFoundApi } from '../middlewares/error-handler.js';
import { uploadLogo } from '../middlewares/upload.js';
import { claveValida, estadoInstalacion } from '../services/instalaciones.service.js';

/**
 * API del superadmin (paquete, licencia, marca, límites y módulos de esta instalación).
 * Para cualquier otro usuario responde igual que una ruta inexistente: así no se sabe que existe.
 */
const router = Router();

// Estado de esta instalación para el panel central: lo consulta otra instalación con la clave compartida
// (Authorization: Bearer <SUPERADMIN_API_KEY>) o el superadmin logueado.
router.get('/estado', async (req, res) => {
  if (req.user?.rol !== 'Superadmin' && !claveValida(req.get('authorization'))) return notFoundApi(req, res);
  res.json(await estadoInstalacion());
});

router.use((req, res, next) => (req.user?.rol === 'Superadmin' ? next() : notFoundApi(req, res)));

router.get('/', superadminController.ver);
router.put('/', superadminController.guardar);
router.post('/logo', uploadLogo, superadminController.subirLogo);
router.delete('/logo', superadminController.quitarLogo);
router.get('/respaldo', superadminController.respaldo);
router.get('/instalaciones', superadminController.instalaciones);
router.put('/instalaciones', superadminController.guardarInstalaciones);

export default router;
