import { formatDateTime, html } from '../core/ui.js';
import { createCrudPage, value } from './crud-page.js';

createCrudPage({
  endpoint: '/admin/categorias',
  title: 'Categorías',
  subtitle: 'Organizá los productos del menú por categorías. Las que no se preparan en cocina (bebidas, postres...) las despacha la caja.',
  icon: 'tags',
  singular: 'categoría',
  genero: 'a',
  columns: [
    { label: 'ID', class: 'text-muted', render: (c) => c.id },
    { label: 'Nombre', render: (c) => html`<span class="fw-medium">${c.nombre}</span>` },
    {
      label: 'Preparación',
      render: (c) =>
        c.va_a_cocina !== false
          ? html`<span class="badge rounded-pill text-bg-warning"><i class="bi bi-fire me-1"></i>Cocina</span>`
          : html`<span class="badge rounded-pill text-bg-info"><i class="bi bi-cup-straw me-1"></i>Caja</span>`,
    },
    { label: 'Actualizada', class: 'd-none d-md-table-cell text-muted small', render: (c) => formatDateTime(c.updated_at, { withYear: true }) },
  ],
  form: (c) => html`
    <label class="form-label fw-medium" for="f-nombre">Nombre <span class="text-danger">*</span></label>
    <input class="form-control" id="f-nombre" name="nombre" maxlength="255" required value="${c?.nombre || ''}">
    <div class="invalid-feedback">Ingresá un nombre.</div>
    <div class="form-check form-switch mt-3">
      <input class="form-check-input" type="checkbox" role="switch" id="f-cocina" name="va_a_cocina" ${c?.va_a_cocina === false ? '' : 'checked'}>
      <label class="form-check-label fw-medium" for="f-cocina">Se prepara en cocina</label>
      <div class="form-text">Desactivalo para bebidas, postres o cafetería: no van a la cocina, los prepara y entrega la caja. Un producto va a la cocina solo si todas sus categorías lo indican.</div>
    </div>`.toString(),
  read: (form) => ({ nombre: value(form, 'nombre'), va_a_cocina: form.elements.va_a_cocina.checked }),
});
