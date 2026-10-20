import { estadisticasRepo } from '../repositories/estadisticas.repository.js';
import { addDays } from '../utils/dates.js';
import { unprocessable } from '../utils/http-error.js';

const MAX_DIAS = 366;

/** Devuelve todas las series del rango [start, end] (fechas YYYY-MM-DD). */
export async function obtenerEstadisticas(start, end) {
  if (end < start) throw unprocessable('La fecha de fin debe ser posterior o igual a la de inicio.');

  const dias = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    dias.push(d);
    if (dias.length > MAX_DIAS) throw unprocessable(`El rango no puede superar ${MAX_DIAS} días.`);
  }

  const desde = `${start} 00:00:00`;
  const hasta = `${end} 23:59:59`;

  const [ventas, horas, masVendidos, ventasPorCategoria, pedidosPorEstado, resumen] = await Promise.all([
    estadisticasRepo.ventasDiarias(desde, hasta),
    estadisticasRepo.ingresosPorHora(desde, hasta),
    estadisticasRepo.masVendidos(desde, hasta),
    estadisticasRepo.ventasPorCategoria(desde, hasta),
    estadisticasRepo.pedidosPorEstado(desde, hasta),
    estadisticasRepo.resumen(desde, hasta),
  ]);

  // Rellenamos días y horas sin ventas con 0 para que los gráficos sean continuos.
  const ventasMap = new Map(ventas.map((v) => [v.fecha, Number(v.total)]));
  const horasMap = new Map(horas.map((h) => [Number(h.hora), Number(h.total)]));
  const pad = (n) => String(n).padStart(2, '0');

  const ventasTotal = Number(resumen.ventas.total);
  const cantidadPagos = Number(resumen.ventas.cantidad);

  return {
    rango: { start, end },
    resumen: {
      ventas_total: ventasTotal,
      pagos_completados: cantidadPagos,
      ticket_promedio: cantidadPagos ? Math.round((ventasTotal / cantidadPagos) * 100) / 100 : 0,
      pedidos_total: Number(resumen.pedidos.total),
      pedidos_entregados: Number(resumen.pedidos.entregados),
      pedidos_cancelados: Number(resumen.pedidos.cancelados),
      pedidos_kiosco: Number(resumen.pedidos.kiosco),
      pedidos_caja: Number(resumen.pedidos.caja),
      pedidos_mozo: Number(resumen.pedidos.mozo),
      por_metodo: resumen.porMetodo.map((m) => ({ tipo: m.tipo, total: Number(m.total), cantidad: Number(m.cantidad) })),
    },
    ventasDiarias: dias.map((fecha) => ({ fecha, total: ventasMap.get(fecha) || 0 })),
    ingresosPorHora: Array.from({ length: 24 }, (_, h) => ({ hora: `${pad(h)}:00-${pad((h + 1) % 24)}:00`, total: horasMap.get(h) || 0 })),
    masVendidos: masVendidos.map((m) => ({ nombre: m.nombre, total_vendido: Number(m.total_vendido), importe: Number(m.importe) })),
    ventasPorCategoria: ventasPorCategoria.map((c) => ({ nombre: c.nombre, total_vendido: Number(c.total_vendido) })),
    pedidosPorEstado: pedidosPorEstado.map((e) => ({ estado: e.estado, total: Number(e.total) })),
  };
}
