import { api } from '../core/api.js';
import { html, money } from '../core/ui.js';
import { createCrudPage, value } from './crud-page.js';

let categorias = [];
let ingredientes = [];

async function cargarOpciones() {
  const [c, i] = await Promise.all([
    api.get('/admin/categorias', { estado: 'activos', per_page: 100 }),
    api.get('/admin/ingredientes', { estado: 'activos', per_page: 100 }),
  ]);
  categorias = c.data;
  ingredientes = i.data;
}

const chips = (list, cls) =>
  list.length ? list.map((x) => html`<span class="badge rounded-pill ${cls} me-1 mb-1">${x.nombre}</span>`) : html`<span class="text-muted small">—</span>`;

function form(p) {
  const catSel = new Set((p?.categorias || []).map((c) => c.id));
  const ingSel = new Map((p?.ingredientes || []).map((i) => [i.id, i]));
  // El ingrediente solo se puede ofrecer como extra si tiene precio de extra (Admin → Ingredientes).
  const tienePrecioExtra = (i) => (i.precio_extra_ingrediente ?? i.precio_extra) != null;
  // Si el producto tiene relaciones deshabilitadas, también las mostramos para no perderlas.
  const cats = [...categorias, ...(p?.categorias || []).filter((c) => !categorias.some((x) => x.id === c.id))];
  const ings = [...ingredientes, ...(p?.ingredientes || []).filter((i) => !ingredientes.some((x) => x.id === i.id))];
  const imagenExterna = p?.imagen && /^https?:\/\//.test(p.imagen) ? p.imagen : '';

  return html`
    <div class="row g-4">
      <div class="col-lg-5">
        <div class="mb-3">
          <label class="form-label fw-medium" for="f-nombre">Nombre <span class="text-danger">*</span></label>
          <input class="form-control" id="f-nombre" name="nombre" maxlength="255" required value="${p?.nombre || ''}">
          <div class="invalid-feedback">Ingresá un nombre.</div>
        </div>
        <div class="mb-3">
          <label class="form-label fw-medium" for="f-desc">Descripción <span class="text-danger">*</span></label>
          <textarea class="form-control" id="f-desc" name="descripcion" rows="3" maxlength="2000" required>${p?.descripcion || ''}</textarea>
          <div class="invalid-feedback">Ingresá una descripción.</div>
        </div>
        <div class="mb-3">
          <label class="form-label fw-medium" for="f-precio">Precio <span class="text-danger">*</span></label>
          <div class="input-group">
            <span class="input-group-text">$</span>
            <input type="number" class="form-control" id="f-precio" name="precio" min="0" step="0.01" required value="${p?.precio ?? ''}">
          </div>
        </div>

        <label class="form-label fw-medium">Imagen</label>
        <div class="img-preview mb-2"><img id="img-preview" src="${p?.imagen || '/img/placeholder-producto.svg'}" alt="Vista previa"></div>
        <input type="file" class="form-control mb-2" name="imagen" id="f-imagen" accept="image/jpeg,image/png,image/gif,image/webp">
        <input type="url" class="form-control mb-1" name="imagen_url" id="f-imagen-url" placeholder="...o pegá una URL https://" value="${imagenExterna}">
        <div class="form-text">JPG, PNG, GIF o WEBP, máximo 5 MB.</div>
        ${p ? html`<div class="form-check mt-2"><input class="form-check-input" type="checkbox" name="quitar_imagen" id="f-quitar"><label class="form-check-label small" for="f-quitar">Quitar imagen actual</label></div>` : ''}
      </div>

      <div class="col-lg-7">
        <div class="mb-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <label class="form-label fw-medium mb-0">Categorías <span class="text-danger">*</span></label>
            <input type="search" class="form-control form-control-sm w-auto" placeholder="Filtrar..." data-filter="cats">
          </div>
          <div class="check-grid" id="cats">
            ${cats.map(
              (c) => html`<label class="check-item" data-name="${c.nombre.toLowerCase()}">
                <input class="form-check-input" type="checkbox" name="categoria_ids" value="${c.id}" ${catSel.has(c.id) ? 'checked' : ''}>
                <span>${c.nombre}${c.activo === false ? ' (deshabilitada)' : ''}</span></label>`,
            )}
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center mb-1">
          <label class="form-label fw-medium mb-0">Ingredientes</label>
          <input type="search" class="form-control form-control-sm w-auto" placeholder="Filtrar..." data-filter="ings">
        </div>
        <div class="form-text mt-0 mb-2">
          Marcá los que lleva el producto. Los <b>obligatorios</b> no se pueden quitar al pedir.
          Con <b>Extra</b> el cliente puede pedir más cantidad de ese ingrediente (ej. carne extra en la hamburguesa, pero no en la empanada).
        </div>
        <div class="ing-list" id="ings">
          ${ings.map((i) => {
            const sel = ingSel.get(i.id);
            const conPrecio = tienePrecioExtra(i);
            const extra = conPrecio && (sel ? sel.permite_extra !== false : true);
            return html`<div class="ing-row" data-name="${i.nombre.toLowerCase()}">
              <label class="d-flex align-items-center gap-2 flex-grow-1 mb-0 cursor-pointer">
                <input class="form-check-input mt-0" type="checkbox" name="ingrediente_ids" value="${i.id}" ${sel ? 'checked' : ''}>
                <span>${i.nombre}${i.activo === false ? ' (deshabilitado)' : ''}</span>
              </label>
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" role="switch" name="obligatorio_${i.id}" id="obl-${i.id}" ${sel?.es_obligatorio ? 'checked' : ''} ${sel ? '' : 'disabled'}>
                <label class="form-check-label small" for="obl-${i.id}">Obligatorio</label>
              </div>
              <div class="form-check form-switch mb-0 ms-2" title="${conPrecio ? 'El cliente puede pedir más cantidad de este ingrediente' : 'Este ingrediente no tiene precio de extra (se configura en Ingredientes)'}">
                <input class="form-check-input" type="checkbox" role="switch" id="ext-${i.id}" data-con-precio="${conPrecio ? '1' : ''}" ${extra && sel ? 'checked' : ''} ${sel && conPrecio ? '' : 'disabled'}>
                <label class="form-check-label small ${conPrecio ? '' : 'text-muted'}" for="ext-${i.id}">Extra</label>
              </div>
            </div>`;
          })}
        </div>
      </div>
    </div>`.toString();
}

function onOpen(f) {
  const preview = f.querySelector('#img-preview');
  const file = f.querySelector('#f-imagen');
  const url = f.querySelector('#f-imagen-url');
  const original = preview.src;

  file.addEventListener('change', () => {
    if (file.files[0]) {
      preview.src = URL.createObjectURL(file.files[0]);
      url.value = '';
    } else preview.src = original;
  });
  url.addEventListener('input', () => {
    if (url.value.trim()) {
      preview.src = url.value.trim();
      file.value = '';
    }
  });
  f.querySelector('#f-quitar')?.addEventListener('change', (e) => {
    preview.src = e.target.checked ? '/img/placeholder-producto.svg' : original;
  });

  f.querySelectorAll('[name=ingrediente_ids]').forEach((chk) =>
    chk.addEventListener('change', () => {
      const sw = f.querySelector(`#obl-${chk.value}`);
      sw.disabled = !chk.checked;
      if (!chk.checked) sw.checked = false;
      // Extra: solo si el ingrediente tiene precio de extra; al marcarlo queda permitido por defecto.
      const ext = f.querySelector(`#ext-${chk.value}`);
      const conPrecio = Boolean(ext.dataset.conPrecio);
      ext.disabled = !chk.checked || !conPrecio;
      ext.checked = chk.checked && conPrecio;
    }),
  );

  f.querySelectorAll('[data-filter]').forEach((input) =>
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      f.querySelectorAll(`#${input.dataset.filter} [data-name]`).forEach((el) => {
        el.hidden = q && !el.dataset.name.includes(q);
      });
    }),
  );
}

function read(f) {
  const categoria_ids = [...f.querySelectorAll('[name=categoria_ids]:checked')].map((c) => Number(c.value));
  if (!categoria_ids.length) throw new Error('Seleccioná al menos una categoría.');
  const ingredientesSel = [...f.querySelectorAll('[name=ingrediente_ids]:checked')].map((c) => ({
    id: Number(c.value),
    es_obligatorio: f.querySelector(`#obl-${c.value}`).checked,
    permite_extra: f.querySelector(`#ext-${c.value}`).checked,
  }));

  const fd = new FormData();
  fd.append('nombre', value(f, 'nombre'));
  fd.append('descripcion', value(f, 'descripcion'));
  fd.append('precio', value(f, 'precio'));
  fd.append('categoria_ids', JSON.stringify(categoria_ids));
  fd.append('ingredientes', JSON.stringify(ingredientesSel));
  const file = f.querySelector('#f-imagen').files[0];
  if (file) fd.append('imagen', file);
  else if (value(f, 'imagen_url')) fd.append('imagen_url', value(f, 'imagen_url'));
  if (f.querySelector('#f-quitar')?.checked) fd.append('quitar_imagen', '1');
  return fd;
}

createCrudPage({
  endpoint: '/admin/productos',
  title: 'Productos',
  subtitle: 'Catálogo que ven el kiosco de autoservicio y la caja.',
  icon: 'basket',
  singular: 'producto',
  modalSize: 'modal-xl',
  fetchFull: true,
  columns: [
    { label: '', class: 'col-img', render: (p) => html`<img src="${p.imagen}" alt="" class="thumb" loading="lazy">` },
    { label: 'Producto', render: (p) => html`<div class="fw-medium">${p.nombre}</div><div class="small text-muted text-truncate-2">${p.descripcion}</div>` },
    { label: 'Precio', class: 'text-nowrap', render: (p) => money(p.precio) },
    { label: 'Categorías', class: 'd-none d-lg-table-cell', render: (p) => chips(p.categorias, 'text-bg-light border') },
    {
      label: 'Ingredientes',
      class: 'd-none d-xl-table-cell',
      render: (p) =>
        p.ingredientes.length
          ? p.ingredientes.map(
              (i) =>
                html`<span class="badge rounded-pill ${i.es_obligatorio ? 'bg-brand' : 'text-bg-light border'} me-1 mb-1" title="${i.es_obligatorio ? 'Obligatorio' : 'Opcional'}${i.precio_extra != null ? ' · se puede pedir extra' : ''}">${i.nombre}${i.precio_extra != null ? html` <i class="bi bi-plus-circle-fill"></i>` : ''}</span>`,
            )
          : html`<span class="text-muted small">—</span>`,
    },
  ],
  beforeOpen: cargarOpciones,
  form,
  onOpen,
  read,
});
