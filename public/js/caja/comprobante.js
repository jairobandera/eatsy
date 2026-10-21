import { api } from '../core/api.js';
import { escapeHtml, nombreNegocio } from '../core/ui.js';
import { renderBarcodes, ticketHtml } from '../core/ticket.js';

const ticket = document.getElementById('ticket');
const id = Number(new URLSearchParams(location.search).get('id'));

try {
  if (!id) throw new Error('Falta el número de pedido.');
  const pedido = await api.get(`/caja/pedidos/${id}`);
  document.title = `Comprobante ${pedido.codigo} · ${nombreNegocio()}`;
  ticket.innerHTML = ticketHtml(pedido);
  renderBarcodes(ticket);
  document.getElementById('btn-print').addEventListener('click', () => window.print());
} catch (err) {
  ticket.innerHTML = `<p class="text-danger text-center">${escapeHtml(err.message)}</p>`;
}
