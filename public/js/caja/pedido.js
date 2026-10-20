/* global bootstrap */
import { api } from '../core/api.js';
import { mountLayout } from '../core/layout.js';
import { createRealtime } from '../core/realtime.js';
import { confirmDialog, debounce, escapeHtml, html, money, renderPagination, showError, toast, withLoading } from '../core/ui.js';
import { abrirComprobante, clienteNombre } from './shared.js';
import { initClientes } from './clientes.js';

/**
 * Toma de pedidos. La usan la caja (/caja/pedido) y el mozo (/mozo/pedido):
 * el mozo indica la mesa en lugar del cliente, no elige el pago (se registra al cobrar)
 * y el pedido va directo a la cocina.
 */
const MOZO = location.pathname.startsWith('/mozo');
const BASE = MOZO ? '/mozo' : '/caja';
await mountLayout(MOZO ? 'mozo' : 'caja', { realtime: true, sound: MOZO });
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const editId = Number(params.get('id')) || null;
const MAX_MESA = 999;
const mesaValida = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_MESA;

const AUTO_COCINA_KEY = 'ap_caja_auto_cocina';
const leerAutoCocina = () => {
  try {
    return localStorage.getItem(AUTO_COCINA_KEY) !== '0';
  } catch {
    return true;
  }
};

app.innerHTML = `
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
    <h1 class="page-title h3"><i class="bi bi-${editId ? 'pencil-square' : 'plus-circle'} text-brand me-2"></i><span id="titulo">${editId ? 'Editar pedido' : 'Nuevo pedido'}</span></h1>
    <a href="${BASE}" class="btn btn-outline-secondary rounded-pill"><i class="bi bi-arrow-left me-1"></i>${MOZO ? 'Volver a mis mesas' : 'Volver a pedidos'}</a>
  </div>

  <div class="row g-4">
    <section class="col-lg-7 col-xl-8">
      <div class="card-app p-3 mb-3">
        <div class="input-group mb-2">
          <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
          <input type="search" class="form-control" id="buscar" placeholder="Buscar producto..." autocomplete="off">
        </div>
        <div class="chips-scroll" id="categorias"></div>
      </div>
      <div class="row g-3" id="productos"></div>
      <div class="mt-3" id="paginacion"></div>
    </section>

    <aside class="col-lg-5 col-xl-4">
      <div class="sticky-lg-top" style="top: 80px">
        <div class="card-app p-3 mb-3" id="panel-cliente"></div>

        <div class="card-app p-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 class="h6 fw-semibold mb-0"><i class="bi bi-cart3 me-1"></i>Pedido</h2>
            <button class="btn btn-sm btn-link text-danger text-decoration-none p-0" id="vaciar">Vaciar</button>
          </div>
          <ul class="list-group list-group-flush cart-list" id="carrito"></ul>
          <div class="border-top pt-3 mt-2">
            <div class="mb-2" id="cupon-panel"></div>
            <div class="d-flex justify-content-between align-items-center mb-3">
              <span class="fw-semibold">Total</span><span class="fs-4 fw-bold" id="total">$ 0,00</span>
            </div>
            ${MOZO ? '' : `<div class="mb-3">
              <div class="small fw-medium mb-1">Método de pago</div>
              <div class="btn-group w-100" role="group" aria-label="Método de pago">
                <input type="radio" class="btn-check" name="metodo" id="m-efectivo" value="Efectivo" checked>
                <label class="btn btn-outline-brand" for="m-efectivo"><i class="bi bi-cash me-1"></i>Efectivo</label>
                <input type="radio" class="btn-check" name="metodo" id="m-tarjeta" value="Tarjeta">
                <label class="btn btn-outline-brand" for="m-tarjeta"><i class="bi bi-credit-card me-1"></i>Tarjeta</label>
              </div>
            </div>`}
            ${editId || MOZO ? '' : `<div class="form-check form-switch mb-3">
              <input class="form-check-input" type="checkbox" role="switch" id="auto-cocina" ${leerAutoCocina() ? 'checked' : ''}>
              <label class="form-check-label small" for="auto-cocina">Enviar a cocina al confirmar</label>
            </div>`}
            <button class="btn btn-brand w-100 rounded-pill py-2 fw-semibold" id="confirmar" disabled data-loading-text="Guardando...">
              <i class="bi bi-${MOZO && !editId ? 'fire' : 'check2-circle'} me-1"></i>${editId ? 'Guardar cambios' : MOZO ? 'Enviar a cocina' : 'Confirmar pedido'}
            </button>
          </div>
        </div>
      </div>
    </aside>
  </div>

  <div class="modal fade" id="modal-producto" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered"><div class="modal-content" id="producto-content"></div></div>
  </div>

  <div class="modal fade" id="modal-creado" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered"><div class="modal-content text-center">
      <div class="modal-body p-4">
        <i class="bi bi-check-circle-fill text-success display-4"></i>
        <h2 class="h4 fw-bold mt-2">${MOZO ? '¡Pedido enviado a cocina!' : '¡Pedido creado!'}</h2>
        <p class="mb-1 text-muted">Código</p>
        <p class="display-6 fw-bold text-brand mb-1" id="creado-codigo"></p>
        <p class="text-muted small" id="creado-info"></p>
      </div>
      <div class="modal-footer justify-content-center flex-wrap">
        ${MOZO ? '' : '<button class="btn btn-outline-secondary rounded-pill" id="creado-print"><i class="bi bi-printer me-1"></i>Comprobante</button>'}
        <a class="btn btn-outline-primary rounded-pill" href="${BASE}"><i class="bi bi-list-ul me-1"></i>${MOZO ? 'Ver mis mesas' : 'Ver pedidos'}</a>
        <button class="btn btn-brand rounded-pill" id="creado-otro"><i class="bi bi-plus-lg me-1"></i>Otro pedido</button>
      </div>
    </div></div>
  </div>`;

const els = {
  productos: app.querySelector('#productos'),
  categorias: app.querySelector('#categorias'),
  carrito: app.querySelector('#carrito'),
  total: app.querySelector('#total'),
  confirmar: app.querySelector('#confirmar'),
};
const modalProducto = new bootstrap.Modal(app.querySelector('#modal-producto'));
const modalCreado = new bootstrap.Modal(app.querySelector('#modal-creado'));

const state = { page: 1, buscar: '', categoriaId: null, productos: [], carrito: [], cliente: null, cupon: null };

// ───────────── Catálogo ─────────────
async function cargarCategorias() {
  const cats = await api.get('/catalogo/categorias');
  els.categorias.innerHTML =
    `<button class="btn btn-sm rounded-pill chip active" data-cat="">Todas</button>` +
    cats.map((c) => html`<button class="btn btn-sm rounded-pill chip" data-cat="${c.id}">${c.nombre}</button>`).join('');
}

async function cargarProductos() {
  els.productos.innerHTML = '<div class="col-12 text-center py-4"><div class="spinner-border text-secondary"></div></div>';
  try {
    const res = await api.get('/catalogo/productos', { buscar: state.buscar, categoria_id: state.categoriaId, page: state.page, per_page: 12 });
    state.productos = res.data;
    els.productos.innerHTML = res.data.length
      ? res.data
          .map(
            (p) => html`<div class="col-6 col-md-4 col-xl-3">
              <button class="card-app product-tile w-100 text-start p-0" data-prod="${p.id}">
                <div class="position-relative"><img src="${p.imagen}" alt="" loading="lazy">
                  ${p.promocion ? html`<span class="badge bg-brand position-absolute top-0 start-0 m-2">${p.promocion.tipo_descuento === 'porcentaje' ? `-${p.promocion.descuento}%` : `-${money(p.promocion.descuento)}`}</span>` : ''}
                </div>
                <div class="p-2">
                  <div class="small fw-semibold text-truncate">${p.nombre}</div>
                  <div class="small">${p.promocion ? html`<s class="text-muted me-1">${money(p.precio)}</s>` : ''}<span class="fw-bold text-brand">${money(p.precio_final)}</span></div>
                </div>
              </button></div>`,
          )
          .join('')
      : '<div class="col-12"><div class="empty-state"><i class="bi bi-search"></i>No se encontraron productos.</div></div>';
    renderPagination(app.querySelector('#paginacion'), res, (pg) => {
      state.page = pg;
      cargarProductos();
    });
  } catch (err) {
    els.productos.innerHTML = `<div class="col-12 text-danger">${escapeHtml(err.message)}</div>`;
  }
}

els.categorias.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  els.categorias.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
  state.categoriaId = b.dataset.cat || null;
  state.page = 1;
  cargarProductos();
});
app.querySelector('#buscar').addEventListener(
  'input',
  debounce((e) => {
    state.buscar = e.target.value.trim();
    state.page = 1;
    cargarProductos();
  }),
);

// ───────────── Modal de producto (ingredientes y cantidad) ─────────────
els.productos.addEventListener('click', (e) => {
  const b = e.target.closest('[data-prod]');
  if (b) abrirProducto(state.productos.find((p) => p.id === Number(b.dataset.prod)));
});

function abrirProducto(p) {
  const content = app.querySelector('#producto-content');
  content.innerHTML = html`
    <div class="modal-header"><h5 class="modal-title">${p.nombre}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <img src="${p.imagen}" alt="" class="w-100 rounded-3 mb-3 object-fit-cover" style="max-height:200px">
      <p class="small text-muted">${p.descripcion}</p>
      <p class="mb-3">${p.promocion ? html`<s class="text-muted me-2">${money(p.precio)}</s><span class="badge bg-brand me-2">${p.promocion.nombre}</span>` : ''}<span class="fs-5 fw-bold text-brand">${money(p.precio_final)}</span></p>
      ${p.ingredientes.length
        ? html`<div class="fw-medium mb-1">Ingredientes</div>
          <div class="small text-muted mb-2">Destildá los que el cliente no quiere. Con <b>Extra</b> se suma más cantidad del mismo ingrediente.</div>
          <ul class="list-unstyled mb-3 ing-caja">${p.ingredientes.map(
            (i) => html`<li class="d-flex align-items-center justify-content-between gap-2 py-1 border-bottom" data-ing="${i.id}">
              <div class="form-check mb-0">
                <input class="form-check-input" type="checkbox" id="ing-${i.id}" value="${i.id}" data-nombre="${i.nombre}" checked ${i.es_obligatorio ? 'disabled' : ''}>
                <label class="form-check-label small ${i.es_obligatorio ? 'text-muted' : ''}" for="ing-${i.id}">${i.nombre}${i.es_obligatorio ? ' (obligatorio)' : ''}</label>
              </div>
              ${i.precio_extra != null
                ? html`<div class="d-flex align-items-center gap-1 small text-nowrap">
                    <span class="text-success">Extra ${Number(i.precio_extra) ? `+${money(i.precio_extra)}` : 'gratis'}</span>
                    <div class="btn-group btn-group-sm">
                      <button type="button" class="btn btn-outline-success" data-extra="${i.id}" data-d="-1" aria-label="Menos extra"><i class="bi bi-dash"></i></button>
                      <span class="btn btn-light disabled px-2" data-extra-n="${i.id}">0</span>
                      <button type="button" class="btn btn-outline-success" data-extra="${i.id}" data-d="1" aria-label="Más extra"><i class="bi bi-plus"></i></button>
                    </div>
                  </div>`
                : ''}
            </li>`,
          )}</ul>`
        : ''}
      <label class="form-label fw-medium" for="cantidad">Cantidad</label>
      <div class="input-group qty-group mb-1" style="max-width:170px">
        <button class="btn btn-outline-secondary" type="button" data-qty="-1"><i class="bi bi-dash"></i></button>
        <input type="number" class="form-control text-center" id="cantidad" value="1" min="1" max="99">
        <button class="btn btn-outline-secondary" type="button" data-qty="1"><i class="bi bi-plus"></i></button>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-brand rounded-pill w-100" id="agregar"><i class="bi bi-cart-plus me-1"></i>Agregar al pedido · <span id="prod-subtotal"></span></button></div>`.toString();

  const qty = content.querySelector('#cantidad');
  const extras = new Map(); // id → cantidad extra
  const porId = new Map(p.ingredientes.map((i) => [i.id, i]));
  const extrasUnidad = () => [...extras].reduce((s, [id, n]) => s + n * Number(porId.get(id).precio_extra || 0), 0);

  const actualizar = () => {
    content.querySelectorAll('[data-ing]').forEach((li) => {
      const id = Number(li.dataset.ing);
      const chk = li.querySelector('.form-check-input');
      const sin = !chk.checked && !chk.disabled;
      if (sin) extras.delete(id); // si se quita, no puede llevar extra
      const n = extras.get(id) || 0;
      const nEl = li.querySelector('[data-extra-n]');
      if (nEl) nEl.textContent = n;
      li.querySelectorAll('[data-extra]').forEach((b) => (b.disabled = sin || (b.dataset.d === '-1' ? n === 0 : n >= MAX_EXTRA)));
    });
    content.querySelector('#prod-subtotal').textContent = money((p.precio_final + extrasUnidad()) * (Number(qty.value) || 1));
  };

  content.onclick = (e) => {
    const q = e.target.closest('[data-qty]');
    const ex = e.target.closest('[data-extra]');
    if (q) qty.value = Math.min(99, Math.max(1, Number(qty.value) + Number(q.dataset.qty)));
    if (ex) {
      const id = Number(ex.dataset.extra);
      const n = Math.min(MAX_EXTRA, Math.max(0, (extras.get(id) || 0) + Number(ex.dataset.d)));
      if (n) extras.set(id, n);
      else extras.delete(id);
    }
    if (q || ex) actualizar();
  };
  content.onchange = actualizar;
  qty.addEventListener('input', actualizar);

  content.querySelector('#agregar').addEventListener('click', () => {
    const quitados = [...content.querySelectorAll('.form-check-input:not(:checked):not(:disabled)')].map((c) => ({ id: Number(c.value), nombre: c.dataset.nombre }));
    agregar({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio_final + extrasUnidad(), // precio por unidad, con extras
      cantidad: Math.min(99, Math.max(1, Number(qty.value) || 1)),
      quitados,
      extras: [...extras].map(([id, n]) => ({ id, nombre: porId.get(id).nombre, cantidad: n })),
    });
    modalProducto.hide();
    toast(`${p.nombre} agregado`);
  });
  actualizar();
  modalProducto.show();
}

// ───────────── Carrito ─────────────
const MAX_EXTRA = 3;
const keyOf = (item) =>
  `${item.id}:${item.quitados.map((q) => q.id).sort((a, b) => a - b).join(',')}:${[...item.extras]
    .sort((a, b) => a.id - b.id)
    .map((e) => `${e.id}x${e.cantidad}`)
    .join(',')}`;

function agregar(item) {
  const existente = state.carrito.find((x) => keyOf(x) === keyOf(item));
  if (existente) existente.cantidad = Math.min(99, existente.cantidad + item.cantidad);
  else state.carrito.push(item);
  renderCarrito();
}

function renderCarrito() {
  els.carrito.innerHTML = state.carrito.length
    ? state.carrito
        .map(
          (it, idx) => html`<li class="list-group-item px-0">
            <div class="d-flex justify-content-between gap-2">
              <div class="flex-grow-1"><div class="fw-medium small">${it.nombre}</div>
                ${it.extras.length ? html`<div class="small text-success">Extra: ${it.extras.map((e) => `${e.cantidad}x ${e.nombre}`).join(', ')}</div>` : ''}
                ${it.quitados.length ? html`<div class="small text-danger">Sin: ${it.quitados.map((q) => q.nombre).join(', ')}</div>` : ''}
                <div class="small text-muted">${money(it.precio)} c/u</div></div>
              <div class="text-end"><div class="fw-semibold small">${money(it.precio * it.cantidad)}</div>
                <div class="btn-group btn-group-sm mt-1">
                  <button class="btn btn-outline-secondary" data-dec="${idx}" aria-label="Restar"><i class="bi bi-dash"></i></button>
                  <span class="btn btn-light disabled px-2">${it.cantidad}</span>
                  <button class="btn btn-outline-secondary" data-inc="${idx}" aria-label="Sumar"><i class="bi bi-plus"></i></button>
                  <button class="btn btn-outline-danger" data-del="${idx}" aria-label="Quitar"><i class="bi bi-trash"></i></button>
                </div></div>
            </div></li>`,
        )
        .join('')
    : '<li class="list-group-item px-0 text-center text-muted small py-4"><i class="bi bi-cart d-block fs-3 mb-1"></i>Agregá productos desde el catálogo</li>';

  els.total.textContent = money(totalPedido());
  renderCupon();
  els.confirmar.disabled = !state.carrito.length;
}

// ───────────── Cupón (código de descuento de monto fijo) ─────────────
const subtotalPedido = () => state.carrito.reduce((s, it) => s + it.precio * it.cantidad, 0);
function descuentoCupon() {
  if (!state.cupon) return 0;
  const elegibles = new Set(state.cupon.productos);
  const base = state.carrito.filter((it) => elegibles.has(it.id)).reduce((s, it) => s + it.precio * it.cantidad, 0);
  return Math.round(Math.min(state.cupon.descuento, base) * 100) / 100;
}
const totalPedido = () => subtotalPedido() - descuentoCupon();

function renderCupon() {
  const box = app.querySelector('#cupon-panel');
  const c = state.cupon;
  if (!c) {
    box.innerHTML = `<div class="input-group input-group-sm">
        <span class="input-group-text bg-white"><i class="bi bi-ticket-perforated"></i></span>
        <input type="text" class="form-control text-uppercase" id="cupon-input" placeholder="Código de descuento" maxlength="30" autocomplete="off">
        <button type="button" class="btn btn-outline-brand" id="cupon-aplicar">Aplicar</button>
      </div>`;
    return;
  }
  const desc = descuentoCupon();
  box.innerHTML = html`<div class="d-flex justify-content-between align-items-center rounded-3 border border-success-subtle bg-success-subtle px-2 py-1 small">
      <span><i class="bi bi-ticket-perforated-fill me-1"></i><b>${c.codigo}</b> · ${c.nombre}</span>
      <button type="button" class="btn btn-sm btn-link text-danger p-0" id="cupon-quitar" aria-label="Quitar cupón"><i class="bi bi-x-circle-fill"></i></button>
    </div>
    ${desc > 0
      ? html`<div class="d-flex justify-content-between small text-success mt-1"><span>Descuento cupón</span><span>-${money(desc)}</span></div>`
      : html`<div class="small text-warning-emphasis mt-1"><i class="bi bi-info-circle me-1"></i>El pedido no tiene productos de esta promoción.</div>`}`.toString();
}

async function aplicarCupon() {
  const input = app.querySelector('#cupon-input');
  const codigo = input.value.trim().toUpperCase();
  if (!codigo) return input.focus();
  try {
    state.cupon = await api.post('/catalogo/cupon', { codigo });
    toast(`Cupón ${state.cupon.codigo} aplicado`);
    renderCarrito();
  } catch (err) {
    showError(err, 'Código no válido');
  }
}

app.querySelector('#cupon-panel').addEventListener('click', (e) => {
  if (e.target.closest('#cupon-aplicar')) aplicarCupon();
  if (e.target.closest('#cupon-quitar')) {
    state.cupon = null;
    renderCarrito();
  }
});
app.querySelector('#cupon-panel').addEventListener('keydown', (e) => {
  if (e.target.id === 'cupon-input' && e.key === 'Enter') {
    e.preventDefault();
    aplicarCupon();
  }
});
app.querySelector('#cupon-panel').addEventListener('input', (e) => {
  if (e.target.id === 'cupon-input') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

els.carrito.addEventListener('click', (e) => {
  const b = e.target.closest('[data-inc],[data-dec],[data-del]');
  if (!b) return;
  const idx = Number(b.dataset.inc ?? b.dataset.dec ?? b.dataset.del);
  const it = state.carrito[idx];
  if (b.dataset.inc !== undefined) it.cantidad = Math.min(99, it.cantidad + 1);
  if (b.dataset.dec !== undefined) it.cantidad -= 1;
  if (b.dataset.del !== undefined || it.cantidad < 1) state.carrito.splice(idx, 1);
  renderCarrito();
});

app.querySelector('#vaciar').addEventListener('click', async () => {
  if (!state.carrito.length) return;
  if (await confirmDialog({ title: '¿Vaciar el pedido?', confirmText: 'Vaciar', danger: true, icon: 'warning' })) {
    state.carrito = [];
    renderCarrito();
  }
});

app.querySelector('#auto-cocina')?.addEventListener('change', (e) => {
  try {
    localStorage.setItem(AUTO_COCINA_KEY, e.target.checked ? '1' : '0');
  } catch {
    /* sin storage */
  }
});

// ───────────── Cliente (caja) o mesa (mozo) ─────────────
let clientes = null;
let mesaInput = null;
if (MOZO) {
  app.querySelector('#panel-cliente').innerHTML = html`
    <label class="form-label fw-semibold mb-1" for="mesa"><i class="bi bi-grid-3x3-gap me-1"></i>Mesa</label>
    <input type="number" class="form-control form-control-lg fw-bold" id="mesa" min="1" max="${MAX_MESA}" inputmode="numeric" placeholder="Número de mesa" value="${params.get('mesa') || ''}">`.toString();
  mesaInput = app.querySelector('#mesa');
} else {
  clientes = initClientes(app.querySelector('#panel-cliente'), (cliente) => {
    state.cliente = cliente;
  });
}

// ───────────── Confirmar ─────────────
els.confirmar.addEventListener('click', async () => {
  if (!state.carrito.length) return;
  const metodo = app.querySelector('[name=metodo]:checked')?.value ?? 'Efectivo';
  const total = totalPedido();
  const mesa = Number(mesaInput?.value);
  if (MOZO && !mesaValida(mesa)) {
    mesaInput.classList.add('is-invalid');
    mesaInput.focus();
    return toast('Indicá el número de mesa', 'warning');
  }
  mesaInput?.classList.remove('is-invalid');

  const ok = await confirmDialog({
    title: editId ? '¿Guardar los cambios?' : MOZO ? `¿Enviar el pedido de la mesa ${mesa} a la cocina?` : '¿Confirmar el pedido?',
    html: MOZO
      ? `<p class="mb-0">Total: <b>${money(total)}</b></p>`
      : `<p class="mb-1">Total: <b>${money(total)}</b> en <b>${metodo}</b></p>
      <p class="mb-0 small text-muted">${state.cliente ? `Cliente: ${escapeHtml(clienteNombre(state.cliente))}` : 'Sin cliente asociado (no suma puntos).'}</p>`,
    confirmText: editId ? 'Guardar' : MOZO ? 'Enviar' : 'Confirmar',
  });
  if (!ok) return;

  const items = state.carrito.map((it) => ({
    id: it.id,
    cantidad: it.cantidad,
    quitados: it.quitados.map((q) => q.id),
    extras: it.extras.map((e) => ({ id: e.id, cantidad: e.cantidad })),
  }));
  const codigoCupon = state.cupon && descuentoCupon() > 0 ? state.cupon.codigo : null;
  const body = MOZO ? { mesa, items, codigo_cupon: codigoCupon } : {
    items,
    metodo_pago: metodo,
    cliente_id: state.cliente?.id ?? null,
    codigo_cupon: codigoCupon,
  };

  await withLoading(els.confirmar, async () => {
    try {
      if (editId) {
        await api.put(`${BASE}/pedidos/${editId}`, body);
        toast('Pedido actualizado');
        setTimeout(() => (location.href = BASE), 600);
        return;
      }
      const pedido = await api.post(`${BASE}/pedidos`, body);
      const autoCocina = app.querySelector('#auto-cocina')?.checked && pedido.requiere_cocina;
      if (autoCocina) await api.patch(`/caja/pedidos/${pedido.id}/estado`, { estado: 'En Preparacion' }).catch(showError);
      app.querySelector('#creado-codigo').textContent = pedido.codigo;
      app.querySelector('#creado-info').textContent = MOZO
        ? `Mesa ${pedido.mesa} · ${money(pedido.total)}${pedido.requiere_cocina ? '' : ' · sin cocina: lo prepara la caja'}`
        : `${money(pedido.total)} · ${pedido.metodo_pago}${autoCocina ? ' · enviado a cocina' : pedido.requiere_cocina ? '' : ' · sin cocina'}`;
      if (MOZO) app.querySelector('#modal-creado h2').textContent = pedido.requiere_cocina ? '¡Pedido enviado a cocina!' : '¡Pedido enviado a la caja!';
      const print = app.querySelector('#creado-print');
      if (print) print.onclick = () => abrirComprobante(pedido.id);
      modalCreado.show();
    } catch (err) {
      if (err.data?.cupon_invalido) {
        state.cupon = null;
        renderCarrito();
      }
      showError(err, 'No se pudo guardar el pedido');
    }
  });
});

app.querySelector('#creado-otro').addEventListener('click', () => {
  state.carrito = [];
  state.cupon = null;
  clientes?.set(null);
  renderCarrito();
  modalCreado.hide();
  app.querySelector('#buscar').focus();
});

// ───────────── Modo edición ─────────────
async function cargarPedido() {
  try {
    const p = await api.get(`${BASE}/pedidos/${editId}`);
    if (['Entregado', 'En Mesa', 'Cancelado'].includes(p.estado)) {
      await showError(new Error(`El pedido ${p.codigo} está ${p.estado.toLowerCase()} y no se puede editar.`));
      location.href = BASE;
      return;
    }
    app.querySelector('#titulo').textContent = `Editar pedido ${p.codigo}`;
    state.carrito = p.detalles.map((d) => ({
      id: d.producto_id,
      nombre: d.producto.nombre,
      precio: Math.round((d.subtotal / d.cantidad) * 100) / 100,
      cantidad: d.cantidad,
      quitados: d.quitados,
      extras: d.extras.map((e) => ({ id: e.id, nombre: e.nombre, cantidad: e.cantidad })),
    }));
    const radio = app.querySelector(`[name=metodo][value="${p.metodo_pago}"]`);
    if (radio) radio.checked = true;
    clientes?.set(p.cliente);
    if (mesaInput) mesaInput.value = p.mesa ?? '';
    if (p.cupon) {
      // Recuperamos los productos del cupón para recalcular; si venció, se avisa y se quita.
      state.cupon = await api.post('/catalogo/cupon', { codigo: p.cupon.codigo }).catch(() => {
        toast(`El cupón ${p.cupon.codigo} ya no es válido y se quitará al guardar`, 'warning', { timer: 5000 });
        return null;
      });
    }
    renderCarrito();
  } catch (err) {
    showError(err);
  }
}

// Si el admin cambia precios/productos, refrescamos el catálogo.
createRealtime().on('catalogo:actualizado', () => cargarProductos());
// El mozo sigue recibiendo los avisos (pedido listo, mesa que llama) mientras toma un pedido.
if (MOZO) import('../mozo/avisos.js').then((m) => m.iniciarAvisosMozo());

renderCarrito();
await cargarCategorias();
cargarProductos();
if (editId) cargarPedido();
