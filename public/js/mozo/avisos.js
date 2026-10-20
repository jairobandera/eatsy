import { createRealtime } from '../core/realtime.js';
import { play } from '../core/sound.js';
import { toast } from '../core/ui.js';

/**
 * Avisos del mozo en cualquiera de sus pantallas (lista de mesas o tomando un pedido):
 *  - pedido listo en la cocina → campana, vibración y aviso;
 *  - una mesa lo llama desde el QR → sonido discreto y queda anotado hasta que toca "Voy".
 * Los llamados se guardan en la sesión del navegador para no perderlos al cambiar de pantalla.
 */
const KEY = 'ap_mozo_llamados';

export function leerLlamados() {
  try {
    return new Map(JSON.parse(sessionStorage.getItem(KEY)) || []);
  } catch {
    return new Map();
  }
}

function guardar(llamados) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...llamados]));
  } catch {
    /* sin storage */
  }
}

export function atenderLlamado(mesa) {
  const llamados = leerLlamados();
  llamados.delete(mesa);
  guardar(llamados);
}

/**
 * @param {{onCambio?: (pedido?:object)=>void, onLlamado?: (mesa:number)=>void, estadoAnterior?: (id:number)=>string|undefined}} opts
 */
export function iniciarAvisosMozo({ onCambio = () => {}, onLlamado = () => {}, estadoAnterior = () => undefined } = {}) {
  const rt = createRealtime();
  const avisados = new Set();

  rt.on('pedido:estado', (p) => {
    if (p.estado === 'Listo' && estadoAnterior(p.id) !== 'Listo' && !avisados.has(p.id)) {
      avisados.add(p.id);
      play('pedido');
      navigator.vibrate?.([300, 150, 300]);
      toast(`Mesa ${p.mesa}: ${p.codigo} está listo`, 'info', { text: 'Pasá por la cocina a buscarlo.', timer: 8000 });
    }
    onCambio(p);
  });
  rt.on('pedido:creado', onCambio);
  rt.on('pedido:actualizado', onCambio);
  rt.on('pago:estado', onCambio);
  rt.on('mozo:llamado', ({ mesa }) => {
    const llamados = leerLlamados();
    const yaLlamaba = llamados.has(mesa);
    llamados.set(mesa, Date.now());
    guardar(llamados);
    play('mesa');
    navigator.vibrate?.([120, 80, 120]);
    if (!yaLlamaba) toast(`La mesa ${mesa} te llama`, 'warning', { timer: 6000 });
    onLlamado(mesa);
  });
  rt.onReconnect(() => onCambio());
  return rt;
}
