/* global bootstrap */
import { api } from '../core/api.js';
import { escapeHtml, html, showError } from '../core/ui.js';
import { createCrudPage, value } from './crud-page.js';

const ROLES = [
  { value: 'Administrador', label: 'Administrador', icon: 'shield-lock', color: 'danger' },
  { value: 'Cajero', label: 'Cajero', icon: 'cash-stack', color: 'primary' },
  { value: 'Cocina', label: 'Cocina', icon: 'fire', color: 'warning' },
  { value: 'Mozo', label: 'Mozo', icon: 'grid-3x3-gap', color: 'success' },
  { value: 'Cliente', label: 'Kiosco (autoservicio)', icon: 'tablet', color: 'info' },
];
const rolInfo = (rol) => ROLES.find((r) => r.value === rol) || ROLES[0];

await createCrudPage({
  endpoint: '/admin/usuarios',
  title: 'Usuarios',
  subtitle: 'Cuentas del personal, de los mozos (cada uno con el QR de sus mesas) y de los kioscos de autoservicio.',
  icon: 'people',
  singular: 'usuario',
  columns: [
    { label: 'ID', class: 'text-muted', render: (u) => u.id },
    {
      label: 'Nombre',
      render: (u, me) => html`<span class="fw-medium">${u.nombre}</span>${u.id === me.id ? html` <span class="badge text-bg-light border">vos</span>` : ''}`,
    },
    {
      label: 'Rol',
      render: (u) => {
        const r = rolInfo(u.rol);
        return html`<span class="badge rounded-pill text-bg-${r.color}"><i class="bi bi-${r.icon} me-1"></i>${r.label}</span>`;
      },
    },
    {
      label: 'QR de mesas',
      render: (u) =>
        u.rol === 'Mozo'
          ? html`<button class="btn btn-sm btn-outline-dark rounded-pill" data-qr="${u.id}"><i class="bi bi-qr-code me-1"></i>Ver QR</button>`
          : html`<span class="text-muted">—</span>`,
    },
  ],
  canDisable: (u, me) => u.id !== me.id,
  form: (u) => html`
    <div class="mb-3">
      <label class="form-label fw-medium" for="f-nombre">Nombre de usuario <span class="text-danger">*</span></label>
      <input class="form-control" id="f-nombre" name="nombre" maxlength="100" required autocomplete="off" value="${u?.nombre || ''}">
      <div class="invalid-feedback">Ingresá un nombre de usuario.</div>
    </div>
    <div class="mb-3">
      <label class="form-label fw-medium" for="f-pass">Contraseña ${u ? '' : html`<span class="text-danger">*</span>`}</label>
      <input type="password" class="form-control" id="f-pass" name="contrasena" minlength="8" maxlength="200" autocomplete="new-password" ${u ? '' : 'required'}>
      <div class="form-text">${u ? 'Dejala vacía para mantener la actual. ' : ''}Mínimo 8 caracteres.</div>
      <div class="invalid-feedback">La contraseña debe tener al menos 8 caracteres.</div>
    </div>
    <label class="form-label fw-medium" for="f-rol">Rol <span class="text-danger">*</span></label>
    <select class="form-select" id="f-rol" name="rol" required>
      ${ROLES.map((r) => html`<option value="${r.value}" ${u?.rol === r.value ? 'selected' : ''}>${r.label}</option>`)}
    </select>
    <div class="form-text">Los mozos reciben un código QR para poner en sus mesas.</div>`.toString(),
  read: (form) => {
    const body = { nombre: value(form, 'nombre'), rol: value(form, 'rol') };
    const pass = form.elements.contrasena.value;
    if (pass) body.contrasena = pass;
    return body;
  },
  // Al crear un mozo se muestra su QR para imprimirlo.
  afterSave: (saved, { nuevo }) => {
    if (nuevo && saved?.rol === 'Mozo') verQr(saved.id, { recienCreado: true });
  },
});

// ───────────── QR del mozo ─────────────
document.body.insertAdjacentHTML(
  'beforeend',
  `<div class="modal fade" id="modal-qr" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title" id="qr-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body text-center">
        <div class="alert alert-success small text-start d-none" id="qr-nuevo"><i class="bi bi-check-circle me-1"></i>Se creó el QR de este mozo. Imprimilo y ponelo en las mesas que atiende.</div>
        <div class="qr-box mx-auto mb-2" id="qr-svg"></div>
        <div class="small text-muted text-break" id="qr-url"></div>
        <p class="small mt-2 mb-0">El cliente lo escanea, indica su número de mesa, ve el estado de su pedido y puede llamar al mozo.</p>
        <div class="alert alert-warning small text-start mt-3 mb-0 d-none" id="qr-inactivo"><i class="bi bi-exclamation-triangle me-1"></i>El usuario está deshabilitado: el QR no funciona hasta que lo habilites.</div>
      </div>
      <div class="modal-footer">
        <a class="btn btn-outline-secondary rounded-pill" id="qr-descargar" download><i class="bi bi-download me-1"></i>Descargar</a>
        <button class="btn btn-brand rounded-pill" id="qr-imprimir"><i class="bi bi-printer me-1"></i>Imprimir</button>
      </div>
    </div></div>
  </div>`,
);
const modalEl = document.getElementById('modal-qr');
const modal = new bootstrap.Modal(modalEl);
let actual = null;

async function verQr(id, { recienCreado = false } = {}) {
  try {
    actual = await api.get(`/admin/usuarios/${id}/qr`);
  } catch (err) {
    return showError(err, 'No se pudo obtener el QR');
  }
  modalEl.querySelector('#qr-title').innerHTML = html`<i class="bi bi-qr-code me-2"></i>QR de ${actual.mozo.nombre}`.toString();
  modalEl.querySelector('#qr-svg').innerHTML = actual.svg; // SVG generado por el servidor
  modalEl.querySelector('#qr-url').textContent = actual.url;
  modalEl.querySelector('#qr-nuevo').classList.toggle('d-none', !recienCreado);
  modalEl.querySelector('#qr-inactivo').classList.toggle('d-none', actual.mozo.activo !== false);
  const descargar = modalEl.querySelector('#qr-descargar');
  descargar.href = actual.png;
  descargar.download = `qr-mesas-${actual.mozo.nombre.replace(/[^\w-]+/g, '_')}.png`;
  modal.show();
}

/** Imprime una tarjeta con el QR en un iframe oculto. */
function imprimir() {
  if (!actual) return;
  const tarjeta = `<div class="tarjeta">
      <img src="/img/logo.png" alt="" class="logo">
      <div class="qr">${actual.svg}</div>
      <h2>Escaneá con tu celular</h2>
      <p>Mirá cómo va tu pedido y llamá a tu mozo sin levantarte.</p>
      <div class="mozo">Te atiende <b>${escapeHtml(actual.mozo.nombre)}</b></div>
      <div class="mesa">Mesa N° ______</div>
    </div>`;
  const doc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR ${escapeHtml(actual.mozo.nombre)}</title>
    <style>
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Poppins, system-ui, sans-serif; color: #14171a; }
      .tarjeta { width: 110mm; margin: 0 auto; border: 1px dashed #adb5bd; border-radius: 5mm; padding: 9mm; text-align: center; }
      .logo { height: 16mm; }
      .qr svg { width: 80mm; height: 80mm; display: block; margin: 4mm auto; }
      h2 { font-size: 17pt; margin: 2mm 0 1mm; }
      p { font-size: 11pt; margin: 0 0 4mm; color: #495057; }
      .mozo { font-size: 12pt; }
      .mesa { font-size: 13pt; margin-top: 4mm; font-weight: 600; }
    </style></head><body>${tarjeta}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.appendChild(iframe);
  iframe.onload = () => {
    const win = iframe.contentWindow;
    // Esperamos a que cargue el logo antes de imprimir.
    const img = win.document.querySelector('img');
    const go = () => {
      win.focus();
      win.print();
      setTimeout(() => iframe.remove(), 1000);
    };
    if (img && !img.complete) {
      img.addEventListener('load', go, { once: true });
      img.addEventListener('error', go, { once: true });
    }
    else go();
  };
  iframe.srcdoc = doc;
}

modalEl.querySelector('#qr-imprimir').addEventListener('click', imprimir);
document.getElementById('app').addEventListener('click', (e) => {
  const b = e.target.closest('[data-qr]');
  if (b) verQr(Number(b.dataset.qr));
});
