/* global JsBarcode */
import { formatDateTime, html, money, nombreNegocio } from './ui.js';

/**
 * Genera el HTML del ticket (lo usan la caja y el kiosco).
 * @param {object} p pedido con detalles
 * @param {{titulo?: string, mostrarCliente?: boolean}} opts
 */
export function ticketHtml(p, { titulo = 'Comprobante de pedido', mostrarCliente = true } = {}) {
  const descuentos = (p.detalles || []).reduce((s, d) => s + (d.descuento || 0), 0);
  return html`
    <img src="/negocio/logo" alt="${nombreNegocio()}" class="logo">
    <h1>${titulo}</h1>
    <div class="center">${formatDateTime(p.created_at, { withYear: true })}${p.origen ? ` · ${p.origen}` : ''}</div>
    <hr>
    <div class="center">Tu número de pedido</div>
    <div class="codigo">${p.codigo}</div>
    <svg class="barcode" data-codigo="${p.codigo}"></svg>
    <hr>
    <table>
      ${(p.detalles || []).map(
        (d) => html`<tr><td>${d.cantidad} x ${d.producto.nombre}${d.extras?.length ? html`<div class="sin">Extra: ${d.extras.map((e) => `${e.cantidad}x ${e.nombre}`).join(', ')}</div>` : ''}${d.quitados?.length ? html`<div class="sin">Sin: ${d.quitados.map((q) => q.nombre).join(', ')}</div>` : ''}</td><td class="num">${money(d.subtotal)}</td></tr>`,
      )}
      ${descuentos ? html`<tr><td>Promociones aplicadas</td><td class="num">-${money(descuentos)}</td></tr>` : ''}
      ${p.cupon ? html`<tr><td>Cupón ${p.cupon.codigo}</td><td class="num">-${money(p.cupon.descuento)}</td></tr>` : ''}
      <tr class="total"><td>TOTAL</td><td class="num">${money(p.total)}</td></tr>
    </table>
    <div>Pago: ${p.metodo_pago}${p.pago ? ` (${p.pago.estado})` : ''}</div>
    ${mostrarCliente && p.cliente
      ? html`<hr><div><b>Cliente:</b> ${p.cliente.nombre} ${p.cliente.apellido}<br>CI: ${p.cliente.cedula}</div>
        ${p.puntos_generados ? html`<div>Puntos generados: <b>${p.puntos_generados}</b><br>Puntos totales: <b>${p.cliente.puntos}</b></div>` : ''}`
      : ''}
    <hr>
    <div class="center">Retirá tu pedido cuando veas tu código en pantalla.<br><b>¡Gracias por tu compra!</b></div>`.toString();
}

/** Dibuja los códigos de barras CODE128 dentro de `root`. */
export function renderBarcodes(root = document) {
  root.querySelectorAll('svg.barcode').forEach((svg) => {
    try {
      JsBarcode(svg, svg.dataset.codigo, { format: 'CODE128', width: 2, height: 46, displayValue: false, margin: 0 });
    } catch (err) {
      console.error('No se pudo generar el código de barras', err);
    }
  });
}

/** Abre una ventana con el ticket y la imprime (sin depender de la página actual). */
export function imprimirTicket(innerHtml) {
  const w = window.open('', '_blank', 'width=420,height=700');
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket</title>
    <link rel="stylesheet" href="/css/ticket.css"></head>
    <body class="ticket-page"><article class="ticket">${innerHtml}</article>
    <script>window.addEventListener('load',()=>{setTimeout(()=>{window.print();},200)});<\/script></body></html>`);
  w.document.close();
  return true;
}
