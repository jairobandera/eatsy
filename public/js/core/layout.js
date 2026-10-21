import { api } from './api.js';
import { confirmDialog, escapeHtml, getNegocio, moduloActivo, nombreNegocio, showError } from './ui.js';
import { isMuted, setMuted } from './sound.js';

/** Menús por sección. */
const MENUS = {
  admin: [
    { href: '/admin', icon: 'speedometer2', label: 'Inicio' },
    { href: '/admin/productos', icon: 'basket', label: 'Productos' },
    { href: '/admin/categorias', icon: 'tags', label: 'Categorías' },
    { href: '/admin/ingredientes', icon: 'egg-fried', label: 'Ingredientes' },
    { href: '/admin/promociones', icon: 'percent', label: 'Promociones' },
    { href: '/admin/reglas-puntos', icon: 'star', label: 'Puntos' },
    { href: '/admin/usuarios', icon: 'people', label: 'Usuarios' },
    { href: '/admin/estadisticas', icon: 'bar-chart', label: 'Estadísticas' },
  ],
  caja: [
    { href: '/caja', icon: 'receipt', label: 'Pedidos' },
    { href: '/caja/pedido', icon: 'plus-circle', label: 'Nuevo pedido' },
    { href: '/caja/entregados', icon: 'bag-check', label: 'Entregados' },
    { href: '/llamados', icon: 'display', label: 'Llamados', external: true },
  ],
  cocina: [{ href: '/cocina', icon: 'fire', label: 'Pedidos en preparación' }],
  superadmin: [{ href: '/superadmin', icon: 'shield-lock', label: 'Configuración de la instalación' }],
  mozo: [
    { href: '/mozo', icon: 'grid-3x3-gap', label: 'Mis mesas' },
    { href: '/mozo/pedido', icon: 'plus-circle', label: 'Nuevo pedido' },
  ],
};


let currentUser = null;

/** Obtiene el usuario de la sesión (o redirige a /login). */
export async function getUser() {
  if (currentUser) return currentUser;
  const { user } = await api.get('/auth/me');
  currentUser = user;
  return user;
}

export async function logout() {
  if (!(await confirmDialog({ title: '¿Cerrar sesión?', confirmText: 'Cerrar sesión', icon: 'warning' }))) return;
  try {
    await api.post('/auth/logout', {});
    window.location.href = '/login';
  } catch (err) {
    showError(err);
  }
}

/** Aviso (al administrador) de que el servicio está por vencer. */
function avisoLicencia(negocio, user) {
  const lic = negocio?.licencia;
  if (!lic || !['Administrador', 'Superadmin'].includes(user.rol)) return '';
  if (lic.estado === 'por_vencer') {
    const [y, m, d] = lic.vence.split('-');
    const cuando = lic.dias === 0 ? 'hoy' : lic.dias === 1 ? 'mañana' : `el ${d}/${m}/${y}`;
    return `<div class="alert alert-warning rounded-0 mb-0 py-2 text-center small" role="alert"><i class="bi bi-exclamation-triangle-fill me-1"></i>El servicio vence <b>${cuando}</b>. Comunicate con el proveedor para renovarlo y no perder el acceso.</div>`;
  }
  if (user.rol === 'Superadmin' && ['vencida', 'suspendida'].includes(lic.estado)) {
    return `<div class="alert alert-danger rounded-0 mb-0 py-2 text-center small" role="alert"><i class="bi bi-slash-circle me-1"></i>Licencia ${lic.estado}: el negocio no puede usar la app (vos sí, como superadmin).</div>`;
  }
  return '';
}

/**
 * Monta la barra de navegación en <header id="app-navbar">.
 * @param {'admin'|'caja'|'cocina'|'mozo'} section
 * @param {{ realtime?: boolean, sound?: boolean }} opts
 */
export async function mountLayout(section, { realtime = false, sound = false } = {}) {
  const [user, negocio] = await Promise.all([getUser(), getNegocio()]);
  const host = document.getElementById('app-navbar');
  const path = location.pathname.replace(/\/$/, '') || '/';
  const esAdmin = user.rol === 'Administrador' || user.rol === 'Superadmin';
  const extras = [
    ...(esAdmin && section !== 'admin' ? [{ href: '/admin', icon: 'gear', label: 'Administración' }] : []),
    ...(user.rol === 'Superadmin' && section !== 'superadmin' ? [{ href: '/superadmin', icon: 'shield-lock', label: 'Superadmin' }] : []),
  ];
  // Secciones que el superadmin apagó (módulos) no aparecen en el menú.
  const OCULTAR = { '/admin/reglas-puntos': 'puntos', '/admin/estadisticas': 'estadisticas' };
  const links = [...MENUS[section], ...extras].filter((l) => !OCULTAR[l.href] || moduloActivo(negocio, OCULTAR[l.href]));

  const linkHtml = links
    .map(
      (l) => `<li class="nav-item">
        <a class="nav-link ${path === l.href ? 'active' : ''}" href="${l.href}" ${l.external ? 'target="_blank" rel="noopener"' : ''}>
          <i class="bi bi-${l.icon} me-1"></i>${l.label}
        </a></li>`,
    )
    .join('');

  host.innerHTML = `
    <nav class="navbar navbar-expand-xl navbar-dark app-navbar sticky-top shadow-sm">
      <div class="container-fluid px-3 px-lg-4">
        <a class="navbar-brand d-flex align-items-center gap-2" href="${links[0].href}">
          <span class="brand-logo"><img src="/negocio/logo" alt="${escapeHtml(nombreNegocio())}"></span>
          <span class="fw-semibold d-none d-sm-inline">${{ admin: 'Administración', caja: 'Caja', cocina: 'Cocina', mozo: 'Mozo', superadmin: 'Superadmin' }[section]}</span>
        </a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMain" aria-controls="navMain" aria-expanded="false" aria-label="Menú">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navMain">
          <ul class="navbar-nav me-auto mb-2 mb-xl-0">${linkHtml}</ul>
          <div class="d-flex align-items-center gap-3 flex-wrap">
            ${realtime ? '<span class="rt-status" id="rt-status" title="Conexión en tiempo real"><span class="dot"></span><span class="label">Conectando…</span></span>' : ''}
            ${sound ? `<button class="btn btn-sm btn-outline-light rounded-pill" id="btn-sound" title="Sonido"><i class="bi bi-volume-${isMuted() ? 'mute' : 'up'}"></i></button>` : ''}
            <span class="text-white-50 small"><i class="bi bi-person-circle me-1"></i>${escapeHtml(user.nombre)} · ${escapeHtml(user.rol)}</span>
            <button class="btn btn-sm btn-logout rounded-pill" id="btn-logout"><i class="bi bi-box-arrow-right me-1"></i>Salir</button>
          </div>
        </div>
      </div>
    </nav>
    ${avisoLicencia(negocio, user)}`;

  host.querySelector('#btn-logout').addEventListener('click', logout);

  const soundBtn = host.querySelector('#btn-sound');
  soundBtn?.addEventListener('click', () => {
    setMuted(!isMuted());
    soundBtn.innerHTML = `<i class="bi bi-volume-${isMuted() ? 'mute' : 'up'}"></i>`;
  });

  if (realtime) {
    const el = host.querySelector('#rt-status');
    const labels = { online: 'En vivo', offline: 'Sin conexión', connecting: 'Conectando…' };
    document.addEventListener('realtime:status', (e) => {
      el.dataset.status = e.detail;
      el.querySelector('.label').textContent = labels[e.detail];
    });
  }

  return user;
}
