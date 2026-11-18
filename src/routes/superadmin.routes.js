import { Router } from 'express';
import { superadminController } from '../controllers/superadmin.controller.js';
import { notFoundApi } from '../middlewares/error-handler.js';
import { uploadLogo } from '../middlewares/upload.js';
import { claveValida, estadoInstalacion, reenviarARemota } from '../services/instalaciones.service.js';

/**
 * API del superadmin (paquete, licencia, marca, límites y módulos de esta instalación).
 * Para cualquier otro usuario responde igual que una ruta inexistente: así no se sabe que existe.
 */
const router = Router();
const esSuperadmin = (req) => req.user?.rol === 'Superadmin';

// Estado de esta instalación para el panel central: lo consulta otra instalación con la clave compartida
// (Authorization: Bearer <SUPERADMIN_API_KEY>) o el superadmin logueado.
router.get('/estado', async (req, res) => {
  if (!esSuperadmin(req) && !claveValida(req.get('authorization'))) return notFoundApi(req, res);
  res.json(await estadoInstalacion());
});

// La configuración de esta instalación la puede ver y cambiar el superadmin logueado o el panel
// central de otra instalación con la clave compartida (así se administran todas desde una).
const configuracion = Router();
configuracion.use((req, res, next) => (esSuperadmin(req) || claveValida(req.get('authorization')) ? next() : notFoundApi(req, res)));
configuracion.get('/', superadminController.ver);
configuracion.put('/', superadminController.guardar);
configuracion.post('/logo', uploadLogo, superadminController.subirLogo);
configuracion.delete('/logo', superadminController.quitarLogo);
configuracion.get('/respaldo', superadminController.respaldo);
router.use(configuracion);

// Lo demás, solo el superadmin logueado.
router.use((req, res, next) => (esSuperadmin(req) ? next() : notFoundApi(req, res)));

router.get('/instalaciones', superadminController.instalaciones);
router.put('/instalaciones', superadminController.guardarInstalaciones);

// Administrar otra instalación de la lista (:n = su posición): se reenvía con la clave compartida.
router.get('/remota/:n', (req, res) => reenviarARemota(req, res, ''));
router.put('/remota/:n', (req, res) => reenviarARemota(req, res, ''));
router.post('/remota/:n/logo', uploadLogo, (req, res) => reenviarARemota(req, res, '/logo'));
router.delete('/remota/:n/logo', (req, res) => reenviarARemota(req, res, '/logo'));
router.get('/remota/:n/respaldo', (req, res) => reenviarARemota(req, res, '/respaldo'));

export default router;
