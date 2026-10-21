/* global bootstrap, Swal */
import { api } from '../core/api.js';
import { getUser } from '../core/layout.js';
import { createRealtime } from '../core/realtime.js';
import { renderBarcodes, imprimirTicket, ticketHtml } from '../core/ticket.js';
import { colorMarca, debounce, escapeHtml, getNegocio, html, money, moduloActivo, renderPagination, showError, toast } from '../core/ui.js';
import { cart, precioUnidad } from './cart.js';
import { initTouchKeyboard } from '../core/touch-keyboard.js';

await getUser(); // valida la sesión (redirige al login si venció)
const cuponesActivos = moduloActivo(await getNegocio(), 'cupones');
initTouchKeyboard(); // teclado en pantalla para los campos con [data-tk]

const $ = (sel) => document.querySelector(sel);
const state = { categoriaId: null, buscar: '', orden: 'nombre_asc', page: 1, productos: [] };
const modalProducto = new bootstrap.Modal($('#modal-producto'));
const modalPago = new bootstrap.Modal($('#modal-pago'));
const modalResultado = new bootstrap.Modal($('#modal-resultado'));
const offcanvas = bootstrap.Offcanvas.getOrCreateInstance($('#cart-offcanvas'));

const promoLabel = (p) => (p.promocion.tipo_descuento === 'porcentaje' ? `-${p.promocion.descuento}%` : `-${money(p.promocion.descuento)}`);

// ───────────── Catálogo ─────────────
async function cargarCategorias() {
  const cats = await api.get('/catalogo/categorias');
  $('#categorias').innerHTML =
    `<button class="chip ${state.categoriaId ? '' : 'active'}" data-cat=""><i class="bi bi-grid me-1"></i>Todo</button>` +
    cats.map((c) => html`<button class="chip ${String(state.categoriaId) === String(c.id) ? 'active' : ''}" data-cat="${c.id}">${c.nombre}</button>`).join('');
}

async function cargarProductos() {
  const grid = $('#productos');
  grid.innerHTML = Array.from({ length: 6 }, () => '<div class="col-sm-6 col-xl-4"><div class="product-card skeleton"></div></div>').join('');
  try {
    const res = await api.get('/catalogo/productos', { categoria_id: state.categoriaId, buscar: state.buscar, orden: state.orden, page: state.page, per_page: 12 });
    state.productos = res.data;
    cart.refreshPrices(res.data);
    grid.innerHTML = res.data.length
      ? res.data
          .map(
            (p) => html`<div class="col-sm-6 col-xl-4">
              <article class="product-card" data-prod="${p.id}" tabindex="0" role="button" aria-label="Agregar ${p.nombre}">
                <div class="product-img"><img src="${p.imagen}" alt="${p.nombre}" loading="lazy">
                  ${p.promocion ? html`<span class="promo-badge" title="${p.promocion.nombre}">${promoLabel(p)}</span>` : ''}</div>
                <div class="product-body">
                  <h3>${p.nombre}</h3>
                  <p>${p.descripcion}</p>
                  <div class="d-flex align-items-end justify-content-between mt-auto">
                    <div>${p.promocion ? html`<s class="text-muted small d-block">${money(p.precio)}</s>` : ''}<span class="price">${money(p.precio_final)}</span></div>
                    <span class="add-btn" aria-hidden="true"><i class="bi bi-plus-lg"></i></span>
                  </div>
                </div>
              </article></div>`,
          )
          .join('')
      : `<div class="col-12"><div class="empty-state"><i class="bi bi-search"></i>No encontramos productos${state.buscar ? ` para "${escapeHtml(state.buscar)}"` : ''}.</div></div>`;
    renderPagination($('#paginacion'), res, (pg) => {
      state.page = pg;
      cargarProductos();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } catch (err) {
    grid.innerHTML = `<div class="col-12 text-danger">${escapeHtml(err.message)}</div>`;
  }
}

$('#categorias').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  document.querySelectorAll('#categorias .chip').forEach((c) => c.classList.toggle('active', c === b));
  state.categoriaId = b.dataset.cat || null;
  state.page = 1;
  cargarProductos();
});
$('#orden').addEventListener('change', (e) => {
  state.orden = e.target.value;
  state.page = 1;
  cargarProductos();
});
const onBuscar = debounce((value) => {
  state.buscar = value.trim();
  state.page = 1;
  cargarProductos();
}, 350);
['#buscar', '#buscar-mobile'].forEach((sel) => $(sel).addEventListener('input', (e) => onBuscar(e.target.value)));

// ───────────── Personalizar producto ─────────────
const abrirDesde = (e) => {
  const card = e.target.closest('[data-prod]');
  if (card) abrirProducto(state.productos.find((p) => p.id === Number(card.dataset.prod)));
};
$('#productos').addEventListener('click', abrirDesde);
$('#productos').addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && abrirDesde(e));

const MAX_EXTRA = 3;

function abrirProducto(p) {
  const content = $('#producto-content');
  // Se muestran los ingredientes que se pueden quitar y/o pedir extra.
  const personalizables = p.ingredientes.filter((i) => !i.es_obligatorio || i.precio_extra != null);
  const fijos = p.ingredientes.filter((i) => i.es_obligatorio && i.precio_extra == null);
  const quitados = new Set();
  const extras = new Map(); // id → cantidad extra
  let cantidad = 1;

  const precioExtras = () => p.ingredientes.reduce((s, i) => s + (extras.get(i.id) || 0) * Number(i.precio_extra || 0), 0);
  const extraLabel = (i) => `+${money(i.precio_extra)} c/u`;

  content.innerHTML = html`
    <button type="button" class="btn-close position-absolute top-0 end-0 m-3 z-3 bg-white rounded-circle p-2" data-bs-dismiss="modal" aria-label="Cerrar"></button>
    <div class="row g-0">
      <div class="col-md-5"><img src="${p.imagen}" alt="" class="w-100 h-100 object-fit-cover modal-img"></div>
      <div class="col-md-7 p-4 d-flex flex-column">
        ${p.promocion ? html`<span class="badge bg-brand align-self-start mb-2">${p.promocion.nombre} · ${promoLabel(p)}</span>` : ''}
        <h2 class="h3 fw-bold mb-1">${p.nombre}</h2>
        <p class="text-muted">${p.descripcion}</p>
        ${personalizables.length
          ? html`<h3 class="h6 fw-semibold mt-1 mb-2">Personalizá tu pedido</h3>
            <ul class="ing-k-list list-unstyled mb-2">${personalizables.map(
              (i) => html`<li class="ing-k" data-ing="${i.id}">
                <div class="ing-k-name">
                  <span class="nombre">${i.nombre}</span>${i.es_obligatorio ? html` <i class="bi bi-lock-fill text-muted small" title="Viene siempre"></i>` : ''}
                  <small class="ing-k-sin">Sin ${i.nombre}</small>
                </div>
                <div class="ing-k-actions">
                  ${i.es_obligatorio
                    ? ''
                    : html`<button type="button" class="ing-quitar" data-quitar="${i.id}" aria-pressed="false" aria-label="Quitar o volver a agregar ${i.nombre}">
                        <i class="bi bi-x-lg on"></i><span class="on">Quitar</span><i class="bi bi-arrow-counterclockwise off"></i><span class="off">Agregar</span>
                      </button>`}
                  ${i.precio_extra != null
                    ? html`<div class="extra-k">
                        <span class="extra-k-label">Extra<small>${extraLabel(i)}</small></span>
                        <button type="button" data-extra="${i.id}" data-d="-1" aria-label="Menos ${i.nombre}"><i class="bi bi-dash-lg"></i></button>
                        <span class="extra-k-n" data-extra-n="${i.id}">0</span>
                        <button type="button" data-extra="${i.id}" data-d="1" aria-label="Más ${i.nombre}"><i class="bi bi-plus-lg"></i></button>
                      </div>`
                    : ''}
                </div>
              </li>`,
            )}</ul>`
          : ''}
        ${fijos.length ? html`<p class="small text-muted mb-3"><i class="bi bi-lock me-1"></i>Incluye siempre: ${fijos.map((i) => i.nombre).join(', ')}</p>` : ''}
        <div class="d-flex align-items-center justify-content-between gap-3 mt-auto pt-3 border-top flex-wrap">
          <div class="qty-picker">
            <button type="button" data-q="-1" aria-label="Menos"><i class="bi bi-dash-lg"></i></button>
            <span id="qty">1</span>
            <button type="button" data-q="1" aria-label="Más"><i class="bi bi-plus-lg"></i></button>
          </div>
          <button class="btn btn-brand btn-lg rounded-pill flex-grow-1" id="btn-agregar">Agregar · <span id="subtotal">${money(p.precio_final)}</span></button>
        </div>
      </div>
    </div>`.toString();

  const actualizar = () => {
    content.querySelector('#qty').textContent = cantidad;
    content.querySelector('#subtotal').textContent = money((p.precio_final + precioExtras()) * cantidad);
    content.querySelectorAll('.ing-k').forEach((li) => {
      const id = Number(li.dataset.ing);
      const sin = quitados.has(id);
      const n = extras.get(id) || 0;
      li.classList.toggle('quitado', sin);
      li.classList.toggle('con-extra', n > 0);
      li.querySelector('[data-quitar]')?.setAttribute('aria-pressed', String(sin));
      const nEl = li.querySelector('[data-extra-n]');
      if (nEl) nEl.textContent = n;
      li.querySelectorAll('[data-extra]').forEach((b) => {
        b.disabled = sin || (b.dataset.d === '-1' ? n === 0 : n >= MAX_EXTRA);
      });
    });
  };

  // Un solo listener por apertura (el contenido se reemplaza cada vez).
  content.onclick = (e) => {
    const q = e.target.closest('[data-q]');
    const quitar = e.target.closest('[data-quitar]');
    const extra = e.target.closest('[data-extra]');
    if (q) cantidad = Math.min(20, Math.max(1, cantidad + Number(q.dataset.q)));
    if (quitar) {
      const id = Number(quitar.dataset.quitar);
      if (quitados.has(id)) quitados.delete(id);
      else {
        quitados.add(id);
        extras.delete(id); // si lo quita, no puede pedir extra de ese ingrediente
      }
    }
    if (extra) {
      const id = Number(extra.dataset.extra);
      const n = Math.min(MAX_EXTRA, Math.max(0, (extras.get(id) || 0) + Number(extra.dataset.d)));
      if (n) extras.set(id, n);
      else extras.delete(id);
    }
    if (q || quitar || extra) actualizar();
  };

  content.querySelector('#btn-agregar').addEventListener('click', () => {
    const porId = new Map(p.ingredientes.map((i) => [i.id, i]));
    cart.add({
      producto: p,
      cantidad,
      quitados: [...quitados].map((id) => ({ id, nombre: porId.get(id).nombre })),
      extras: [...extras].map(([id, n]) => ({ id, nombre: porId.get(id).nombre, cantidad: n, precio: Number(porId.get(id).precio_extra) })),
    });
    modalProducto.hide();
    toast(`${p.nombre} agregado`, 'success', { timer: 1500 });
    $('#cart-fab').classList.add('bump');
    setTimeout(() => $('#cart-fab').classList.remove('bump'), 500);
  });
  actualizar();
  modalProducto.show();
}

// ───────────── Carrito ─────────────
let cuponAbierto = false;
let cuponDraft = '';

const extrasTexto = (it) => it.extras.map((e) => `${e.cantidad}x ${e.nombre}`).join(', ');

function cuponHtml() {
  if (!cuponesActivos) return ''; // módulo apagado por el superadmin
  const c = cart.cupon;
  if (c) {
    const desc = cart.descuentoCupon;
    return html`<div class="cupon-box aplicado">
      <div class="d-flex justify-content-between align-items-center">
        <span><i class="bi bi-ticket-perforated-fill me-1"></i><b>${c.codigo}</b> <small class="text-muted">${c.nombre}</small></span>
        <button type="button" class="btn btn-sm btn-link text-danger p-0" data-cupon-quitar aria-label="Quitar cupón"><i class="bi bi-x-circle-fill fs-5"></i></button>
      </div>
      ${desc > 0
        ? html`<div class="small text-success">Descuento de ${money(desc)} aplicado</div>`
        : html`<div class="small text-warning-emphasis"><i class="bi bi-info-circle me-1"></i>Agregá alguno de los productos de esta promoción para usarlo.</div>`}
    </div>`;
  }
  if (!cuponAbierto) {
    return html`<button type="button" class="btn btn-light border w-100 rounded-pill mb-2" data-cupon-abrir><i class="bi bi-ticket-perforated me-1"></i>¿Tenés un código de descuento?</button>`;
  }
  return html`<div class="cupon-box">
    <div class="input-group">
      <input type="text" class="form-control form-control-lg text-uppercase fw-semibold" id="cupon-input" placeholder="Ingresá el código"
             value="${cuponDraft}" data-tk="codigo" data-tk-enter="Aplicar" data-tk-max="30" maxlength="30">
      <button type="button" class="btn btn-brand px-3" data-cupon-aplicar>Aplicar</button>
    </div>
    <button type="button" class="btn btn-link btn-sm text-muted p-0 mt-1" data-cupon-cerrar>Cancelar</button>
  </div>`;
}

async function aplicarCupon() {
  const codigo = cuponDraft.trim().toUpperCase();
  if (!codigo) return;
  try {
    const cupon = await api.post('/catalogo/cupon', { codigo });
    cuponAbierto = false;
    cuponDraft = '';
    cart.setCupon(cupon);
    toast(`Cupón ${cupon.codigo} aplicado`, 'success', { timer: 1800 });
  } catch (err) {
    showError(err, 'Código no válido');
  }
}

function cartHtml() {
  if (!cart.items.length) {
    return `<div class="p-4 text-center text-muted"><i class="bi bi-bag display-5 d-block mb-2 opacity-50"></i>Tu pedido está vacío.<br><small>Tocá un producto para agregarlo.</small></div>`;
  }
  return html`
    <div class="p-3 border-bottom d-none d-lg-flex justify-content-between align-items-center"><h2 class="h5 fw-bold mb-0">Mi pedido</h2><span class="badge rounded-pill bg-brand">${cart.count}</span></div>
    <ul class="list-unstyled mb-0 cart-items">
      ${cart.items.map(
        (it) => html`<li class="cart-line">
          <img src="${it.imagen}" alt="">
          <div class="flex-grow-1 min-w-0">
            <div class="fw-semibold text-truncate">${it.nombre}</div>
            ${it.extras.length ? html`<div class="small text-success text-truncate"><i class="bi bi-plus-circle-fill me-1"></i>Extra: ${extrasTexto(it)}</div>` : ''}
            ${it.quitados.length ? html`<div class="small text-danger text-truncate">Sin: ${it.quitados.map((q) => q.nombre).join(', ')}</div>` : ''}
            <div class="d-flex align-items-center justify-content-between mt-1">
              <div class="qty-picker sm">
                <button data-dec="${it.key}" aria-label="Menos"><i class="bi bi-${it.cantidad === 1 ? 'trash' : 'dash-lg'}"></i></button>
                <span>${it.cantidad}</span>
                <button data-inc="${it.key}" aria-label="Más"><i class="bi bi-plus-lg"></i></button>
              </div>
              <span class="fw-semibold">${money(precioUnidad(it) * it.cantidad)}</span>
            </div>
          </div>
        </li>`,
      )}
    </ul>
    <div class="p-3 border-top">
      ${cuponHtml()}
      ${cart.ahorro > 0.009 ? html`<div class="d-flex justify-content-between small text-success mb-1"><span><i class="bi bi-tag me-1"></i>Promociones</span><span>-${money(cart.ahorro)}</span></div>` : ''}
      ${cart.descuentoCupon > 0 ? html`<div class="d-flex justify-content-between small text-success mb-1"><span><i class="bi bi-ticket-perforated me-1"></i>Cupón ${cart.cupon.codigo}</span><span>-${money(cart.descuentoCupon)}</span></div>` : ''}
      <div class="d-flex justify-content-between align-items-center mb-3"><span class="fw-semibold">Total</span><span class="fs-3 fw-bold">${money(cart.total)}</span></div>
      <button class="btn btn-brand btn-lg w-100 rounded-pill fw-semibold" data-pagar><i class="bi bi-credit-card me-2"></i>Ir a pagar</button>
      <button class="btn btn-link btn-sm text-muted w-100 mt-1" data-vaciar>Vaciar pedido</button>
    </div>`.toString();
}

function renderCart() {
  const markup = cartHtml();
  $('#cart-desktop').innerHTML = markup;
  $('#cart-mobile').innerHTML = markup;
  $('#fab-count').textContent = cart.count;
  $('#fab-total').textContent = cart.count ? money(cart.total) : '';
  $('#cart-fab').classList.toggle('has-items', cart.count > 0);
}

async function onCartClick(e) {
  if (e.target.closest('[data-cupon-abrir]')) {
    cuponAbierto = true;
    renderCart();
    e.currentTarget.querySelector('#cupon-input')?.focus();
    return;
  }
  if (e.target.closest('[data-cupon-cerrar]')) {
    cuponAbierto = false;
    cuponDraft = '';
    return renderCart();
  }
  if (e.target.closest('[data-cupon-aplicar]')) return aplicarCupon();
  if (e.target.closest('[data-cupon-quitar]')) return cart.setCupon(null);

  const inc = e.target.closest('[data-inc]');
  const dec = e.target.closest('[data-dec]');
  if (inc) cart.setCantidad(inc.dataset.inc, cart.items.find((i) => i.key === inc.dataset.inc).cantidad + 1);
  if (dec) cart.setCantidad(dec.dataset.dec, cart.items.find((i) => i.key === dec.dataset.dec).cantidad - 1);
  if (e.target.closest('[data-pagar]')) {
    offcanvas.hide();
    $('#pago-total').textContent = money(cart.total);
    modalPago.show();
  }
  if (e.target.closest('[data-vaciar]')) {
    const r = await Swal.fire({ title: '¿Vaciar el pedido?', icon: 'question', showCancelButton: true, confirmButtonText: 'Sí, vaciar', cancelButtonText: 'No', confirmButtonColor: colorMarca() });
    if (r.isConfirmed) cart.clear();
  }
}
$('#cart-desktop').addEventListener('click', onCartClick);
$('#cart-mobile').addEventListener('click', onCartClick);
cart.subscribe(renderCart);

// Input del cupón: guardamos lo tipeado (el carrito se redibuja) y "Aplicar" también desde el teclado táctil.
document.addEventListener('input', (e) => {
  if (e.target.id === 'cupon-input') {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    cuponDraft = e.target.value;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'cupon-input' && e.key === 'Enter') {
    e.preventDefault();
    aplicarCupon();
  }
});

// ───────────── Pago ─────────────
let enviando = false;
document.querySelectorAll('.pay-option').forEach((btn) =>
  btn.addEventListener('click', async () => {
    if (enviando || !cart.items.length) return;
    enviando = true;
    document.querySelectorAll('.pay-option').forEach((b) => (b.disabled = true));
    btn.classList.add('loading');
    try {
      const pedido = await api.post('/kiosco/pedidos', {
        metodo_pago: btn.dataset.metodo,
        codigo_cupon: cart.cupon && cart.descuentoCupon > 0 ? cart.cupon.codigo : null,
        items: cart.items.map((it) => ({
          id: it.id,
          cantidad: it.cantidad,
          quitados: it.quitados.map((q) => q.id),
          extras: it.extras.map((e) => ({ id: e.id, cantidad: e.cantidad })),
        })),
      });
      cart.clear();
      modalPago.hide();
      mostrarResultado(pedido);
    } catch (err) {
      if (err.data?.cupon_invalido) cart.setCupon(null); // el cupón venció o ya no aplica
      modalPago.hide();
      showError(err, 'No pudimos registrar tu pedido');
      cargarProductos();
    } finally {
      enviando = false;
      btn.classList.remove('loading');
      document.querySelectorAll('.pay-option').forEach((b) => (b.disabled = false));
    }
  }),
);

let cuentaTimer;
function mostrarResultado(pedido) {
  const ticket = $('#ticket-kiosco');
  ticket.innerHTML = ticketHtml({ ...pedido, origen: 'Autoservicio' }, { titulo: 'Tu pedido', mostrarCliente: false });
  renderBarcodes(ticket);
  modalResultado.show();

  let s = 60;
  $('#cuenta').textContent = s;
  clearInterval(cuentaTimer);
  cuentaTimer = setInterval(() => {
    s -= 1;
    $('#cuenta').textContent = s;
    if (s <= 0) reiniciar();
  }, 1000);
}

function reiniciar() {
  clearInterval(cuentaTimer);
  modalResultado.hide();
  state.categoriaId = null;
  state.buscar = '';
  state.page = 1;
  cuponAbierto = false;
  cuponDraft = '';
  ['#buscar', '#buscar-mobile'].forEach((sel) => ($(sel).value = ''));
  cargarCategorias();
  cargarProductos();
  window.scrollTo({ top: 0 });
}

$('#btn-nuevo').addEventListener('click', reiniciar);
$('#btn-imprimir').addEventListener('click', () => {
  if (!imprimirTicket($('#ticket-kiosco').innerHTML)) showError(new Error('El navegador bloqueó la ventana de impresión.'));
});

// ───────────── Inactividad: si alguien deja el pedido a medias, se limpia ─────────────
let idleTimer;
const IDLE_MS = 120_000;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (!cart.items.length || document.querySelector('#modal-resultado.show')) return resetIdle();
    const r = await Swal.fire({
      title: '¿Seguís ahí?',
      text: 'Tu pedido se va a borrar por inactividad.',
      icon: 'question',
      timer: 20_000,
      timerProgressBar: true,
      confirmButtonText: 'Sí, sigo aquí',
      confirmButtonColor: colorMarca(),
    });
    if (r.dismiss === Swal.DismissReason.timer) {
      cart.clear();
      bootstrap.Modal.getInstance($('#modal-producto'))?.hide();
      modalPago.hide();
      offcanvas.hide();
      reiniciar();
    }
    resetIdle();
  }, IDLE_MS);
}
['pointerdown', 'keydown', 'scroll'].forEach((ev) => document.addEventListener(ev, resetIdle, { passive: true }));
resetIdle();

// ───────────── Salida del kiosco (requiere PIN del local) ─────────────
let toques = 0;
let toquesTimer;
$('#btn-logo').addEventListener('click', async () => {
  // 5 toques rápidos sobre el logo abren el diálogo (evita que un cliente lo abra por accidente).
  toques += 1;
  clearTimeout(toquesTimer);
  toquesTimer = setTimeout(() => (toques = 0), 1500);
  if (toques < 5) return;
  toques = 0;
  const { value: pin } = await Swal.fire({
    title: 'Salir del modo kiosco',
    input: 'password',
    inputLabel: 'Ingresá el PIN del local',
    inputAttributes: { inputmode: 'numeric', autocomplete: 'off' },
    showCancelButton: true,
    confirmButtonText: 'Cerrar sesión',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: colorMarca(),
  });
  if (!pin) return;
  try {
    await api.post('/auth/logout', { pin });
    cart.clear();
    location.href = '/login';
  } catch (err) {
    showError(err, 'No se pudo cerrar la sesión');
  }
});

// ───────────── Tiempo real: el catálogo se actualiza solo ─────────────
createRealtime().on(
  'catalogo:actualizado',
  debounce(() => {
    cargarCategorias();
    cargarProductos();
  }, 500),
);

renderCart();
await cargarCategorias();
cargarProductos();
