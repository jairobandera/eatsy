import { api } from '../core/api.js';
import { debounce, formatDate, getNegocio, html, moduloActivo, money, renderPagination, showError, toast, todayYmd, withLoading } from '../core/ui.js';
import { createCrudPage, value } from './crud-page.js';

// Si el superadmin apagó los cupones, las promociones siguen (descuentos automáticos) pero sin código.
const cuponesActivos = moduloActivo(await getNegocio(), 'cupones');

const descuentoLabel = (p) =>
  p.tipo_descuento === 'monto' ? `${money(p.descuento)} ${p.codigo ? 'al total' : 'c/u'}` : `${Number(p.descuento)} %`;

function vigencia(p) {
  const hoy = todayYmd();
  let badge = html`<span class="badge text-bg-success">Vigente</span>`;
  if (p.fecha_inicio && p.fecha_inicio > hoy) badge = html`<span class="badge text-bg-info">Programada</span>`;
  if (p.fecha_fin && p.fecha_fin < hoy) badge = html`<span class="badge text-bg-secondary">Vencida</span>`;
  if (!p.activo) badge = html`<span class="badge text-bg-secondary">Deshabilitada</span>`;
  const rango = p.fecha_inicio || p.fecha_fin ? `${p.fecha_inicio ? formatDate(p.fecha_inicio) : '…'} → ${p.fecha_fin ? formatDate(p.fecha_fin) : '…'}` : 'Sin fecha límite';
  return html`${badge}<div class="small text-muted mt-1">${rango}</div>`;
}

let seleccion = new Map();

function form(p) {
  seleccion = new Map((p?.productos || []).map((x) => [x.id, x]));
  return html`
    <div class="row g-4">
      <div class="col-lg-5">
        <div class="mb-3">
          <label class="form-label fw-medium" for="f-nombre">Nombre <span class="text-danger">*</span></label>
          <input class="form-control" id="f-nombre" name="nombre" maxlength="255" required value="${p?.nombre || ''}">
          <div class="invalid-feedback">Ingresá un nombre.</div>
        </div>
        <div class="row g-2 mb-3">
          <div class="col-6">
            <label class="form-label fw-medium" for="f-tipo">Tipo</label>
            <select class="form-select" id="f-tipo" name="tipo_descuento">
              <option value="porcentaje" ${p?.tipo_descuento !== 'monto' ? 'selected' : ''}>Porcentaje (%)</option>
              <option value="monto" ${p?.tipo_descuento === 'monto' ? 'selected' : ''}>Monto fijo ($)</option>
            </select>
          </div>
          <div class="col-6">
            <label class="form-label fw-medium" for="f-desc">Descuento <span class="text-danger">*</span></label>
            <input type="number" class="form-control" id="f-desc" name="descuento" min="0" step="0.01" required value="${p?.descuento ?? ''}">
          </div>
          <div class="col-12"><div class="form-text" id="desc-help"></div></div>
        </div>
        ${cuponesActivos
          ? html`<div class="mb-3">
              <label class="form-label fw-medium" for="f-codigo">Código de cupón (opcional)</label>
              <input class="form-control text-uppercase" id="f-codigo" name="codigo" maxlength="30" pattern="[A-Za-z0-9]{3,30}" value="${p?.codigo || ''}" autocomplete="off">
              <div class="invalid-feedback">Entre 3 y 30 letras o números, sin espacios.</div>
              <div class="form-text" id="codigo-help"></div>
            </div>`
          : html`<input type="hidden" id="f-codigo" name="codigo" value="${p?.codigo || ''}">
            <div class="alert alert-light border small py-2 mb-3"><i class="bi bi-info-circle me-1"></i>Los <b>cupones con código</b> no están incluidos en el paquete contratado.
              ${p?.codigo
                ? html`Esta promoción es un cupón (código <b>${p.codigo}</b>): mientras los cupones estén desactivados no se aplica.`
                : 'Las promociones se aplican solas en el kiosco y la caja.'}<span id="codigo-help" hidden></span></div>`}
        <div class="row g-2">
          <div class="col-6">
            <label class="form-label fw-medium" for="f-ini">Desde</label>
            <input type="date" class="form-control" id="f-ini" name="fecha_inicio" value="${p?.fecha_inicio || ''}">
          </div>
          <div class="col-6">
            <label class="form-label fw-medium" for="f-fin">Hasta</label>
            <input type="date" class="form-control" id="f-fin" name="fecha_fin" value="${p?.fecha_fin || ''}">
          </div>
          <div class="col-12"><div class="form-text">Sin fechas = vigente siempre. Al vencer, se deshabilita sola.</div></div>
        </div>
      </div>
      <div class="col-lg-7">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <label class="form-label fw-medium mb-0">Productos incluidos <span class="badge rounded-pill text-bg-light border" id="sel-count">0</span></label>
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-brand" id="btn-todos" data-loading-text="Agregando..."><i class="bi bi-check2-all me-1"></i>Agregar todos</button>
            <button type="button" class="btn btn-outline-secondary" id="btn-ninguno"><i class="bi bi-x-lg me-1"></i>Quitar todos</button>
          </div>
        </div>
        <div class="selected-chips mb-2" id="seleccionados"></div>
        <div class="input-group input-group-sm mb-2">
          <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
          <input type="search" class="form-control" id="buscar-prod" placeholder="Buscar productos para agregar...">
        </div>
        <div class="border rounded-3 pick-list" id="lista-prod"></div>
        <div class="mt-2" id="pag-prod"></div>
      </div>
    </div>`.toString();
}

function onOpen(f) {
  const chips = f.querySelector('#seleccionados');
  const lista = f.querySelector('#lista-prod');
  const tipo = f.querySelector('#f-tipo');
  const desc = f.querySelector('#f-desc');
  let query = { buscar: '', page: 1 };

  const codigo = f.querySelector('#f-codigo');
  const updateHelp = () => {
    const pct = tipo.value === 'porcentaje';
    const conCodigo = cuponesActivos && !pct && codigo.value.trim();
    desc.max = pct ? '100' : '';
    f.querySelector('#desc-help').textContent = pct
      ? 'Porcentaje de descuento sobre el precio (0 a 100). Se aplica solo.'
      : conCodigo
        ? 'Con código: se descuenta este monto del TOTAL del pedido cuando el cliente ingresa el cupón (si lleva algún producto incluido).'
        : 'Sin código: se descuenta este monto por unidad de cada producto incluido. Se aplica solo.';
    // El código (cupón) solo está disponible para promociones de monto fijo.
    codigo.disabled = pct;
    if (pct) codigo.value = '';
    f.querySelector('#codigo-help').textContent = pct
      ? 'Disponible solo para promociones de monto fijo.'
      : 'Si cargás un código, la promoción deja de aplicarse sola: el cliente lo ingresa en el kiosco o el cajero en la caja.';
  };
  tipo.addEventListener('change', updateHelp);
  codigo.addEventListener('input', () => {
    codigo.value = codigo.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    updateHelp();
  });
  updateHelp();

  function renderChips() {
    f.querySelector('#sel-count').textContent = seleccion.size;
    chips.innerHTML = seleccion.size
      ? [...seleccion.values()]
          .map((x) => html`<span class="badge rounded-pill bg-brand me-1 mb-1">${x.nombre}<button type="button" data-remove="${x.id}" aria-label="Quitar">&times;</button></span>`)
          .join('')
      : '<span class="text-muted small">Ningún producto seleccionado.</span>';
  }

  async function loadProductos() {
    lista.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm"></div></div>';
    const res = await api.get('/admin/productos', { estado: 'activos', buscar: query.buscar, page: query.page, per_page: 6 });
    lista.innerHTML = res.data.length
      ? res.data
          .map(
            (x) => html`<div class="pick-item">
              <div class="d-flex align-items-center gap-2"><img src="${x.imagen}" class="thumb" style="width:38px;height:38px" alt=""><div><div class="small fw-medium">${x.nombre}</div><div class="small text-muted">${money(x.precio)}</div></div></div>
              ${seleccion.has(x.id)
                ? html`<button type="button" class="btn btn-sm btn-outline-danger rounded-pill" data-remove="${x.id}"><i class="bi bi-dash"></i> Quitar</button>`
                : html`<button type="button" class="btn btn-sm btn-outline-brand rounded-pill" data-add="${x.id}" data-nombre="${x.nombre}"><i class="bi bi-plus"></i> Agregar</button>`}
            </div>`,
          )
          .join('')
      : '<div class="text-center text-muted small p-3">Sin resultados.</div>';
    renderPagination(f.querySelector('#pag-prod'), res, (pg) => {
      query.page = pg;
      loadProductos();
    });
  }

  // Delegación sobre el contenido del modal (se recrea en cada apertura, así no se duplican listeners).
  f.querySelector('#crud-body > .row').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    const rem = e.target.closest('[data-remove]');
    if (add) seleccion.set(Number(add.dataset.add), { id: Number(add.dataset.add), nombre: add.dataset.nombre });
    else if (rem) seleccion.delete(Number(rem.dataset.remove));
    else return;
    renderChips();
    loadProductos();
  });

  // Agrega TODOS los productos activos (recorre todas las páginas del listado).
  f.querySelector('#btn-todos').addEventListener('click', (e) =>
    withLoading(e.currentTarget, async () => {
      try {
        let page = 1;
        let last = 1;
        do {
          const res = await api.get('/admin/productos', { estado: 'activos', page, per_page: 100 });
          res.data.forEach((x) => seleccion.set(x.id, { id: x.id, nombre: x.nombre }));
          last = res.last_page;
          page += 1;
        } while (page <= last);
        renderChips();
        loadProductos();
        toast(`${seleccion.size} productos incluidos`);
      } catch (err) {
        showError(err);
      }
    }),
  );
  f.querySelector('#btn-ninguno').addEventListener('click', () => {
    seleccion.clear();
    renderChips();
    loadProductos();
  });

  const buscar = f.querySelector('#buscar-prod');
  // Enter en el buscador no debe enviar el formulario de la promoción.
  buscar.addEventListener('keydown', (e) => e.key === 'Enter' && e.preventDefault());
  buscar.addEventListener(
    'input',
    debounce((e) => {
      query = { buscar: e.target.value.trim(), page: 1 };
      loadProductos();
    }),
  );

  renderChips();
  loadProductos();
}

function read(f) {
  const ini = value(f, 'fecha_inicio');
  const fin = value(f, 'fecha_fin');
  if (ini && fin && fin < ini) throw new Error('La fecha "Hasta" debe ser igual o posterior a "Desde".');
  return {
    nombre: value(f, 'nombre'),
    tipo_descuento: value(f, 'tipo_descuento'),
    descuento: Number(value(f, 'descuento')),
    codigo: value(f, 'tipo_descuento') === 'monto' ? value(f, 'codigo').toUpperCase() || null : null,
    fecha_inicio: ini || null,
    fecha_fin: fin || null,
    productos: [...seleccion.keys()],
  };
}

createCrudPage({
  endpoint: '/admin/promociones',
  title: 'Promociones',
  subtitle: 'Los descuentos vigentes se aplican automáticamente en el kiosco y en la caja.',
  icon: 'percent',
  singular: 'promoción',
  genero: 'a',
  modalSize: 'modal-xl',
  fetchFull: true,
  columns: [
    {
      label: 'Nombre',
      render: (p) =>
        html`<span class="fw-medium">${p.nombre}</span>${p.codigo
          ? html`<div class="small"><span class="badge ${cuponesActivos ? 'text-bg-dark' : 'text-bg-secondary'}" title="${cuponesActivos ? '' : 'Los cupones están desactivados en el paquete'}"><i class="bi bi-ticket-perforated me-1"></i>Cupón ${p.codigo}${cuponesActivos ? '' : ' (desactivado)'}</span></div>`
          : ''}`,
    },
    { label: 'Descuento', class: 'text-nowrap', render: (p) => html`<span class="badge rounded-pill bg-brand fs-6">${descuentoLabel(p)}</span>` },
    { label: 'Vigencia', render: vigencia },
    { label: 'Productos', class: 'd-none d-md-table-cell', render: (p) => `${p.productos_count ?? 0}` },
  ],
  form,
  onOpen,
  read,
});
