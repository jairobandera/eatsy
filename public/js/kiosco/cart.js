/**
 * Carrito del kiosco. Vive en el navegador (localStorage) y se valida en el servidor al pagar.
 * Cada línea se identifica por producto + ingredientes quitados + extras.
 */
const KEY = 'ap_kiosco_cart';
const listeners = new Set();
let { items, cupon } = load();

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    // Compatibilidad con la versión anterior (guardaba solo el array de ítems).
    if (Array.isArray(data)) return { items: data.map(normalizar), cupon: null };
    return { items: (data?.items || []).map(normalizar), cupon: data?.cupon || null };
  } catch {
    return { items: [], cupon: null };
  }
}

function normalizar(it) {
  return { ...it, extras: it.extras || [], quitados: it.quitados || [] };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ items, cupon }));
  } catch {
    /* sin storage: el carrito queda solo en memoria */
  }
  listeners.forEach((fn) => fn(items));
}

const ids = (list) => [...list].map((x) => x.id).sort((a, b) => a - b);

export const lineKey = (productoId, quitados, extras = []) =>
  `${productoId}:${ids(quitados).join(',')}:${[...extras].sort((a, b) => a.id - b.id).map((e) => `${e.id}x${e.cantidad}`).join(',')}`;

/** Precio de una unidad de la línea (producto con promo + extras). */
export const precioUnidad = (it) => it.precio + it.extras.reduce((s, e) => s + e.precio * e.cantidad, 0);

const round2 = (n) => Math.round(n * 100) / 100;

export const cart = {
  get items() {
    return items;
  },
  get count() {
    return items.reduce((s, i) => s + i.cantidad, 0);
  },
  /** Total antes del cupón. */
  get subtotal() {
    return round2(items.reduce((s, i) => s + precioUnidad(i) * i.cantidad, 0));
  },
  get ahorro() {
    return items.reduce((s, i) => s + (i.precio_original - i.precio) * i.cantidad, 0);
  },

  // ───── Cupón ─────
  get cupon() {
    return cupon;
  },
  /** Descuento del cupón: monto fijo, hasta lo que suman los productos incluidos. */
  get descuentoCupon() {
    if (!cupon) return 0;
    const elegibles = new Set(cupon.productos);
    const base = items.filter((i) => elegibles.has(i.id)).reduce((s, i) => s + precioUnidad(i) * i.cantidad, 0);
    return round2(Math.min(cupon.descuento, base));
  },
  get total() {
    return round2(this.subtotal - this.descuentoCupon);
  },
  setCupon(c) {
    cupon = c;
    save();
  },

  /** @param {{producto: object, cantidad: number, quitados: {id,nombre}[], extras: {id,nombre,cantidad,precio}[]}} */
  add({ producto, cantidad, quitados, extras = [] }) {
    const key = lineKey(producto.id, quitados, extras);
    const existing = items.find((i) => i.key === key);
    if (existing) existing.cantidad = Math.min(99, existing.cantidad + cantidad);
    else
      items.push({
        key,
        id: producto.id,
        nombre: producto.nombre,
        imagen: producto.imagen,
        precio: producto.precio_final,
        precio_original: producto.precio,
        cantidad,
        quitados,
        extras,
      });
    save();
  },

  setCantidad(key, cantidad) {
    const it = items.find((i) => i.key === key);
    if (!it) return;
    if (cantidad < 1) items = items.filter((i) => i.key !== key);
    else it.cantidad = Math.min(99, cantidad);
    save();
  },

  remove(key) {
    items = items.filter((i) => i.key !== key);
    save();
  },

  /** Actualiza precios con el catálogo vigente (por si cambió una promoción o el precio de un extra). */
  refreshPrices(productos) {
    let changed = false;
    for (const it of items) {
      const p = productos.find((x) => x.id === it.id);
      if (!p) continue;
      if (p.precio_final !== it.precio || p.precio !== it.precio_original) {
        it.precio = p.precio_final;
        it.precio_original = p.precio;
        changed = true;
      }
      for (const e of it.extras) {
        const ing = p.ingredientes.find((i) => i.id === e.id);
        if (ing?.precio_extra != null && Number(ing.precio_extra) !== e.precio) {
          e.precio = Number(ing.precio_extra);
          changed = true;
        }
      }
    }
    if (changed) save();
  },

  clear() {
    items = [];
    cupon = null;
    save();
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
