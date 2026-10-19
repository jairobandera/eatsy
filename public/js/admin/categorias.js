import { formatDateTime, html } from '../core/ui.js';
import { createCrudPage, value } from './crud-page.js';

createCrudPage({
  endpoint: '/admin/categorias',
  title: 'Categorías',
  subtitle: 'Organizá los productos del menú por categorías.',
  icon: 'tags',
  singular: 'categoría',
  genero: 'a',
  columns: [
    { label: 'ID', class: 'text-muted', render: (c) => c.id },
    { label: 'Nombre', render: (c) => html`<span class="fw-medium">${c.nombre}</span>` },
    { label: 'Actualizada', class: 'd-none d-md-table-cell text-muted small', render: (c) => formatDateTime(c.updated_at, { withYear: true }) },
  ],
  form: (c) => html`
    <label class="form-label fw-medium" for="f-nombre">Nombre <span class="text-danger">*</span></label>
    <input class="form-control" id="f-nombre" name="nombre" maxlength="255" required value="${c?.nombre || ''}">
    <div class="invalid-feedback">Ingresá un nombre.</div>`.toString(),
  read: (form) => ({ nombre: value(form, 'nombre') }),
});
