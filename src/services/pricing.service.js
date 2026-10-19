import { productosRepo } from '../repositories/productos.repository.js';
import { today } from '../utils/dates.js';

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Descuento por unidad que aplica una promoción a un precio (nunca deja el precio negativo). */
export function descuentoUnitario(precio, promo) {
  if (!promo) return 0;
  const desc = promo.tipo_descuento === 'monto' ? Number(promo.descuento) : (precio * Number(promo.descuento)) / 100;
  return round2(Math.min(Math.max(desc, 0), precio));
}

/**
 * Para cada producto calcula la mejor promoción vigente hoy.
 * @returns {Promise<Map<number, {promocion: object|null, descuento: number, precio_final: number}>>}
 */
export async function preciosVigentes(productos, fecha = today()) {
  const ids = productos.map((p) => p.id);
  const promos = await productosRepo.promocionesVigentes(ids, fecha);
  const result = new Map();

  for (const p of productos) {
    const precio = Number(p.precio);
    let best = { promocion: null, descuento: 0, precio_final: round2(precio) };
    for (const promo of promos) {
      if (promo.producto_id !== p.id) continue;
      const descuento = descuentoUnitario(precio, promo);
      if (descuento > best.descuento) {
        best = {
          promocion: { id: promo.id, nombre: promo.nombre, tipo_descuento: promo.tipo_descuento, descuento: Number(promo.descuento) },
          descuento,
          precio_final: round2(precio - descuento),
        };
      }
    }
    result.set(p.id, best);
  }
  return result;
}

/** Agrega `precio_final` y `promocion` a una lista de productos. */
export async function conPrecios(productos) {
  const precios = await preciosVigentes(productos);
  return productos.map((p) => {
    const { promocion, precio_final } = precios.get(p.id);
    return { ...p, precio_final, promocion };
  });
}
