import { Router } from 'express';
import { superadminController } from '../controllers/superadmin.controller.js';
import { notFoundApi } from '../middlewares/error-handler.js';
import { uploadLogo } from '../middlewares/upload.js';

/**
 * API del superadmin (paquete, licencia, marca, límites y módulos de esta instalación).
 * Para cualquier otro usuario responde igual que una ruta inexistente: así no se sabe que existe.
 */
const router = Router();

router.use((req, res, next) => (req.user?.rol === 'Superadmin' ? next() : notFoundApi(req, res)));

router.get('/', superadminController.ver);
router.put('/', superadminController.guardar);
router.post('/logo', uploadLogo, superadminController.subirLogo);
router.delete('/logo', superadminController.quitarLogo);

export default router;
