/* global Swal */
/**
 * Utilidades de interfaz compartidas (formato, alertas, paginación, etc.).
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * Template tag que escapa automáticamente los valores interpolados.
 * Para insertar HTML ya seguro usar raw(html).
 *   el.innerHTML = html`<b>${nombre}</b>`;
 */
class Raw {
  constructor(v) {
    this.v = v;
  }
  toString() {
    return this.v;
  }
}
export const raw = (v) => new Raw(v);
export function html(strings, ...values) {
  return raw(
    strings.reduce((out, str, i) => {
      const v = values[i - 1];
      const rendered = Array.isArray(v) ? v.map((x) => (x instanceof Raw ? x.v : escapeHtml(x))).join('') : v instanceof Raw ? v.v : escapeHtml(v);
      return out + rendered + str;
    }, ''),
  );
}

const moneyFmt = new Intl.NumberFormat('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => `$ ${moneyFmt.format(Number(n) || 0)}`;

/** '2026-10-19 13:42:31' → '19/10 13:42' */
export function formatDateTime(value, { withYear = false } = {}) {
  if (!value) return '';
  const [d, t = ''] = String(value).split(' ');
  const [y, m, day] = d.split('-');
  return `${day}/${m}${withYear ? `/${y}` : ''} ${t.slice(0, 5)}`.trim();
}
export const formatTime = (value) => String(value || '').slice(11, 16);
export function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Fecha de hoy en hora local: 'YYYY-MM-DD'. */
export function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ───────────── Marca del negocio ─────────────
// El servidor inyecta en cada página el nombre (<meta name="negocio">) y el color (--brand).
export const nombreNegocio = () => document.querySelector('meta[name="negocio"]')?.content || 'Eatsy';
export const colorMarca = () => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#ff5722';

let negocioCache = null;
/** Marca, paquete, módulos habilitados y estado de la licencia (GET /api/publico/negocio). */
export function getNegocio() {
  negocioCache ??= fetch('/api/publico/negocio', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((n) => n || { nombre: nombreNegocio(), paquete: 'full', roles: [], modulos: {} });
  return negocioCache;
}
/** ¿El módulo está habilitado? (si no se pudo leer la configuración, se asume que sí). */
export const moduloActivo = (negocio, modulo) => negocio?.modulos?.[modulo] !== false;

export const ESTADO_CLASES = {
  Cancelado: 'text-bg-danger',
  Recibido: 'text-bg-secondary',
  'En Preparacion': 'text-bg-warning',
  Listo: 'text-bg-info',
  Entregado: 'text-bg-success',
  'En Mesa': 'text-bg-success',
};
export const ESTADO_LABEL = { 'En Preparacion': 'En preparación', 'En Mesa': 'En mesa' };
export const PAGO_CLASES = { Completado: 'text-bg-success', Pendiente: 'text-bg-warning', Fallido: 'text-bg-danger' };

export const estadoBadge = (estado) =>
  html`<span class="badge rounded-pill ${ESTADO_CLASES[estado] || 'text-bg-secondary'}">${ESTADO_LABEL[estado] || estado}</span>`;

// ───────────── Alertas (SweetAlert2) ─────────────
const toastMixin = () =>
  Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, timerProgressBar: true });

export const toast = (title, icon = 'success', opts = {}) => toastMixin().fire({ title, icon, ...opts });

export async function confirmDialog({ title, text, html: htmlContent, confirmText = 'Sí', cancelText = 'Cancelar', icon = 'question', danger = false, input, inputLabel, inputValue }) {
  const result = await Swal.fire({
    title,
    text,
    html: htmlContent,
    icon,
    input,
    inputLabel,
    inputValue,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
    focusCancel: danger,
    customClass: { confirmButton: danger ? 'btn btn-danger mx-1' : 'btn btn-brand mx-1', cancelButton: 'btn btn-outline-secondary mx-1' },
    buttonsStyling: false,
  });
  return input ? (result.isConfirmed ? result.value : null) : result.isConfirmed;
}

export function showError(err, title = 'Algo salió mal') {
  console.error(err);
  const errors = err?.data?.errors;
  const detail = errors ? Object.values(errors).map((m) => `• ${escapeHtml(m)}`).join('<br>') : escapeHtml(err?.message || 'Error inesperado.');
  return Swal.fire({ icon: 'error', title, html: detail, confirmButtonText: 'Entendido', customClass: { confirmButton: 'btn btn-brand' }, buttonsStyling: false });
}

export const showSuccess = (title, text) =>
  Swal.fire({ icon: 'success', title, text, timer: 1800, showConfirmButton: false });

// ───────────── Varios ─────────────
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Deshabilita un botón y muestra spinner mientras corre `fn`. */
export async function withLoading(button, fn) {
  if (!button) return fn();
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>${button.dataset.loadingText || 'Procesando...'}`;
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

/**
 * Dibuja una paginación Bootstrap.
 * @param {HTMLElement} container
 * @param {{page:number,last_page:number,total:number}} meta
 * @param {(page:number)=>void} onChange
 */
export function renderPagination(container, meta, onChange) {
  if (!container) return;
  const { page, last_page: last, total } = meta;
  if (last <= 1) {
    container.innerHTML = total ? `<small class="text-muted">${total} resultado(s)</small>` : '';
    return;
  }
  const pages = new Set([1, last, page - 1, page, page + 1].filter((p) => p >= 1 && p <= last));
  const sorted = [...pages].sort((a, b) => a - b);
  let items = '';
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) items += '<li class="page-item disabled"><span class="page-link">…</span></li>';
    items += `<li class="page-item ${p === page ? 'active' : ''}"><button type="button" class="page-link" data-page="${p}">${p}</button></li>`;
    prev = p;
  }
  container.innerHTML = `
    <nav class="d-flex align-items-center justify-content-between flex-wrap gap-2" aria-label="Paginación">
      <small class="text-muted">${total} resultado(s)</small>
      <ul class="pagination pagination-sm mb-0">
        <li class="page-item ${page <= 1 ? 'disabled' : ''}"><button type="button" class="page-link" data-page="${page - 1}" aria-label="Anterior">&laquo;</button></li>
        ${items}
        <li class="page-item ${page >= last ? 'disabled' : ''}"><button type="button" class="page-link" data-page="${page + 1}" aria-label="Siguiente">&raquo;</button></li>
      </ul>
    </nav>`;
  container.querySelectorAll('[data-page]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = Number(btn.dataset.page);
      if (p >= 1 && p <= last && p !== page) onChange(p);
    }),
  );
}

/** Efecto de "nuevo": vibración + badge por unos segundos. */
export function flashNuevo(el, ms = 2500) {
  if (!el) return;
  el.classList.add('vibrar', 'position-relative');
  const badge = document.createElement('span');
  badge.className = 'badge text-bg-success position-absolute top-0 start-50 translate-middle-x mt-1 badge-nuevo';
  badge.textContent = 'NUEVO';
  el.appendChild(badge);
  setTimeout(() => {
    el.classList.remove('vibrar');
    badge.remove();
  }, ms);
}
