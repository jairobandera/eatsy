import { html, money } from '../core/ui.js';
import { createCrudPage, value } from './crud-page.js';

createCrudPage({
  endpoint: '/admin/ingredientes',
  title: 'Ingredientes',
  subtitle: 'Se asignan a los productos: el cliente puede quitar los no obligatorios y pedir extra de los que tengan precio de extra.',
  icon: 'egg-fried',
  singular: 'ingrediente',
  columns: [
    { label: 'ID', class: 'text-muted', render: (i) => i.id },
    { label: 'Nombre', render: (i) => html`<span class="fw-medium">${i.nombre}</span>` },
    { label: 'Descripción', class: 'd-none d-md-table-cell text-muted small', render: (i) => html`${i.descripcion}` },
    {
      label: 'Como extra',
      class: 'text-nowrap',
      render: (i) =>
        !(Number(i.precio_extra) > 0)
          ? html`<span class="text-muted small">No se ofrece</span>`
          : html`<span class="badge rounded-pill text-bg-success">+ ${money(i.precio_extra)}</span>`,
    },
  ],
  form: (i) => html`
    <div class="mb-3">
      <label class="form-label fw-medium" for="f-nombre">Nombre <span class="text-danger">*</span></label>
      <input class="form-control" id="f-nombre" name="nombre" maxlength="255" required value="${i?.nombre || ''}">
      <div class="invalid-feedback">Ingresá un nombre.</div>
    </div>
    <label class="form-label fw-medium" for="f-desc">Descripción <span class="text-danger">*</span></label>
    <textarea class="form-control" id="f-desc" name="descripcion" rows="3" maxlength="500" required>${i?.descripcion || ''}</textarea>
    <div class="invalid-feedback">Ingresá una descripción.</div>
    <div class="mt-3">
      <label class="form-label fw-medium" for="f-extra">Precio como extra</label>
      <div class="input-group">
        <span class="input-group-text">+ $</span>
        <input type="number" class="form-control" id="f-extra" name="precio_extra" min="0" step="0.01" value="${i?.precio_extra ?? ''}" placeholder="Vacío o 0 = no se ofrece como extra">
      </div>
      <div class="form-text">Lo que se cobra por cada unidad extra (ej. una carne más en la hamburguesa). Vacío o 0 = no se ofrece como extra: el cliente solo lo puede quitar. Se ofrece solo en los productos que ya llevan este ingrediente y lo tienen marcado como <b>Extra</b> (Admin → Productos), hasta 3 por producto.</div>
    </div>`.toString(),
  read: (form) => ({
    nombre: value(form, 'nombre'),
    descripcion: value(form, 'descripcion'),
    precio_extra: value(form, 'precio_extra') === '' ? null : Number(value(form, 'precio_extra')),
  }),
});
