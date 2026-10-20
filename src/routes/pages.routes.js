import { Router } from 'express';
import { pageGuard, seguimientoLock } from '../middlewares/auth.js';
import { HOME_BY_ROLE } from '../services/auth.service.js';
import { paginaVersionada } from '../utils/assets.js';

/**
 * Páginas HTML con URLs limpias. Cada sección valida el rol en el servidor
 * (además de la validación de cada endpoint de la API).
 */
const router = Router();
// El HTML siempre se revalida; sus JS/CSS van con ?v=<hash> (ver utils/assets.js).
const page = (file) => (_req, res) => res.set('Cache-Control', 'no-cache').type('html').send(paginaVersionada(file));

// Celulares de clientes: solo pueden ver su pedido.
router.use(seguimientoLock);

// Seguimiento del pedido (se llega escaneando el QR de la pantalla de llamados)
router.get('/seguimiento', page('seguimiento/index.html'));

router.get('/', (req, res) => res.redirect(req.user ? HOME_BY_ROLE[req.user.rol] : '/login'));
router.get('/login', (req, res, next) => (req.user ? res.redirect(HOME_BY_ROLE[req.user.rol]) : next()), page('login.html'));

// Pantalla pública para el monitor de "pedidos listos"
router.get('/llamados', page('llamados/index.html'));

// Celular del cliente en una mesa (QR del mozo)
router.get('/mesa/:token', page('mesa/index.html'));

const sections = {
  admin: { roles: ['Administrador'], pages: ['productos', 'categorias', 'ingredientes', 'usuarios', 'promociones', 'reglas-puntos', 'estadisticas', 'reporte'] },
  caja: { roles: ['Cajero'], pages: ['pedido', 'entregados', 'comprobante'] },
  cocina: { roles: ['Cocina'], pages: [] },
  kiosco: { roles: ['Cliente'], pages: [] },
  mozo: { roles: ['Mozo'], pages: ['pedido'] },
};

for (const [section, { roles, pages }] of Object.entries(sections)) {
  router.get(`/${section}`, pageGuard(...roles), page(`${section}/index.html`));
  for (const name of pages) {
    router.get(`/${section}/${name}`, pageGuard(...roles), page(`${section}/${name}.html`));
  }
}

export default router;
