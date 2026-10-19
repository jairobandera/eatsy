import { html } from '../core/ui.js';
import { createCrudPage, value } from './crud-page.js';

const ROLES = [
  { value: 'Administrador', label: 'Administrador', icon: 'shield-lock', color: 'danger' },
  { value: 'Cajero', label: 'Cajero', icon: 'cash-stack', color: 'primary' },
  { value: 'Cocina', label: 'Cocina', icon: 'fire', color: 'warning' },
  { value: 'Cliente', label: 'Kiosco (autoservicio)', icon: 'tablet', color: 'info' },
];
const rolInfo = (rol) => ROLES.find((r) => r.value === rol) || ROLES[0];

createCrudPage({
  endpoint: '/admin/usuarios',
  title: 'Usuarios',
  subtitle: 'Cuentas del personal y de los kioscos de autoservicio.',
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
    </select>`.toString(),
  read: (form) => {
    const body = { nombre: value(form, 'nombre'), rol: value(form, 'rol') };
    const pass = form.elements.contrasena.value;
    if (pass) body.contrasena = pass;
    return body;
  },
});
