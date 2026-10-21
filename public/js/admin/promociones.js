import { api } from '../core/api.js';
import { debounce, formatDate, getNegocio, html, moduloActivo, money, renderPagination, showError, toast, todayYmd, withLoading } from '../core/ui.js';
import { createCrudPage, value } from './crud-page.js';

// Si el superadmin apagó los cupones, las promociones automáticas siguen pero no se pueden crear cupones.
const cuponesActivos = moduloActivo(await getNegocio(), 'cupones');

/**
 * Tres tipos para el administrador (en la base: un cupón es una promoción de monto con código):
 *  - porcentaje: automático, ej. 25% en postres;
 *  - monto: automático por producto, ej. $100 menos en cada hamburguesa;
 *  - cupon: con código, el cliente lo ingresa en el kiosco / el cajero en la caja; descuenta del total.
 */
const tipoDe = (p) => (p?.codigo ? 'cupon' : p?.tipo_descuento === 'monto' ? 'monto' : 'porcentaje');
const TIPOS = {
  porcentaje: { label: 'Porcentaje (automático)', ayuda: 'Porcentaje de descuento sobre el precio de cada producto incluido (0 a 100). Se aplica solo en el kiosco y la caja.' },
  monto: { label: 'Monto fijo por producto (automático)', ayuda: 'Se descuenta este monto de cada unidad de los productos incluidos. Se aplica solo en el kiosco y la caja.' },
  cupon: { label: 'Cupón con código', ayuda: 'Se descuenta este monto del TOTAL del pedido solo si el cliente ingresa el código en el kiosco ("¿Tenés un código de descuento?") o el cajero lo carga en la caja, y el pedido lleva algún producto incluido.' },
};

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
        <div class="mb-2">
          <label class="form-label fw-medium" for="f-tipo">Tipo de promoción</label>
          <select class="form-select" id="f-tipo" name="tipo">
            ${['porcentaje', 'monto', ...(cuponesActivos || tipoDe(p) === 'cupon' ? ['cupon'] : [])].map(
              (t) => html`<option value="${t}" ${tipoDe(p) === t ? 'selected' : ''}>${TIPOS[t].label}${t === 'cupon' && !cuponesActivos ? ' (desactivado)' : ''}</option>`,
            )}
          </select>
          <div class="form-text" id="tipo-help"></div>
        </div>
        ${cuponesActivos ? '' : html`<div class="alert alert-light border small py-2 mb-3"><i class="bi bi-info-circle me-1"></i>Los <b>cupones con código</b> no están incluidos en el paquete contratado: solo se pueden crear promociones automáticas.</div>`}
        <div class="mb-3" id="codigo-wrap">
          <label class="form-label fw-medium" for="f-codigo">Código del cupón <span class="text-danger">*</span></label>
          <input class="form-control text-uppercase" id="f-codigo" name="codigo" maxlength="30" pattern="[A-Za-z0-9]{3,30}" value="${p?.codigo || ''}" autocomplete="off" placeholder="Ej. BIENVENIDA">
          <div class="invalid-feedback">Entre 3 y 30 letras o números, sin espacios.</div>
        </div>
        <div class="mb-3">
          <label class="form-label fw-medium" for="f-desc" id="desc-label">Descuento <span class="text-danger">*</span></label>
          <div class="input-group">
            <span class="input-group-text" id="desc-unidad">%</span>
            <input type="number" class="form-control" id="f-desc" name="descuento" min="0" step="0.01" required value="${p?.descuento ?? ''}">
          </div>
        </div>
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
    const t = tipo.value;
    const esCupon = t === 'cupon';
    f.querySelector('#tipo-help').textContent = TIPOS[t].ayuda;
    f.querySelector('#codigo-wrap').hidden = !esCupon;
    codigo.required = esCupon;
    codigo.disabled = !esCupon;
    f.querySelector('#desc-unidad').textContent = t === 'porcentaje' ? '%' : '$';
    f.querySelector('#desc-label').firstChild.textContent = t === 'porcentaje' ? 'Porcentaje ' : esCupon ? 'Monto a descontar del total ' : 'Monto a descontar por producto ';
    desc.max = t === 'porcentaje' ? '100' : '';
  };
  tipo.addEventListener('change', updateHelp);
  codigo.addEventListener('input', () => {
    codigo.value = codigo.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
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
  const tipo = value(f, 'tipo');
  const codigo = tipo === 'cupon' ? value(f, 'codigo').toUpperCase() : null;
  if (tipo === 'cupon' && !codigo) throw new Error('Ingresá el código del cupón.');
  return {
    nombre: value(f, 'nombre'),
    tipo_descuento: tipo === 'porcentaje' ? 'porcentaje' : 'monto',
    descuento: Number(value(f, 'descuento')),
    codigo,
    fecha_inicio: ini || null,
    fecha_fin: fin || null,
    productos: [...seleccion.keys()],
  };
}

createCrudPage({
  endpoint: '/admin/promociones',
  title: 'Promociones',
  subtitle: cuponesActivos
    ? 'Las automáticas se aplican solas en el kiosco y la caja; los cupones, cuando el cliente ingresa el código.'
    : 'Los descuentos vigentes se aplican automáticamente en el kiosco y en la caja.',
  icon: 'percent',
  singular: 'promoción',
  genero: 'a',
  modalSize: 'modal-xl',
  fetchFull: true,
  columns: [
    {
      label: 'Nombre',
      render: (p) =>
        html`<span class="fw-medium">${p.nombre}</span><div class="small">${p.codigo
          ? html`<span class="badge ${cuponesActivos ? 'text-bg-dark' : 'text-bg-secondary'}" title="${cuponesActivos ? 'El cliente ingresa este código' : 'Los cupones están desactivados en el paquete'}"><i class="bi bi-ticket-perforated me-1"></i>Cupón ${p.codigo}${cuponesActivos ? '' : ' (desactivado)'}</span>`
          : html`<span class="badge text-bg-light border"><i class="bi bi-lightning-charge me-1"></i>Automática</span>`}</div>`,
    },
    { label: 'Descuento', class: 'text-nowrap', render: (p) => html`<span class="badge rounded-pill bg-brand fs-6">${descuentoLabel(p)}</span>` },
    { label: 'Vigencia', render: vigencia },
    { label: 'Productos', class: 'd-none d-md-table-cell', render: (p) => `${p.productos_count ?? 0}` },
  ],
  form,
  onOpen,
  read,
});
