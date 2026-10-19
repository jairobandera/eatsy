/**
 * Teclado en pantalla para el kiosco táctil (sin dependencias).
 *
 * Uso: agregar `data-tk` a un <input>. Opcionales:
 *   data-tk="codigo"          → solo letras y números en mayúsculas (sin espacio)
 *   data-tk-enter="Buscar"    → texto de la tecla de confirmación
 *   data-tk-max="30"          → largo máximo
 *
 * El input recibe `inputmode="none"` para que no aparezca el teclado del sistema.
 * Cada tecla dispara el evento `input` (así funcionan los listeners existentes) y la
 * tecla de confirmación dispara `keydown` Enter + el evento personalizado `tk:enter`.
 */
const ROWS_TEXTO = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
];

let panel = null;
let target = null;

function build() {
  panel = document.createElement('div');
  panel.className = 'tk-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Teclado en pantalla');
  panel.innerHTML = `
    <div class="tk-inner">
      <div class="tk-top">
        <div class="tk-preview"><i class="bi bi-keyboard me-2"></i><span class="tk-text"></span><span class="tk-caret"></span></div>
        <button type="button" class="tk-close" data-tk-action="close" aria-label="Ocultar teclado"><i class="bi bi-chevron-down"></i></button>
      </div>
      ${ROWS_TEXTO.map(
        (row) => `<div class="tk-row">${row
          .map((k) => (k === '⌫' ? `<button type="button" class="tk-key tk-wide" data-tk-action="back" aria-label="Borrar"><i class="bi bi-backspace"></i></button>` : `<button type="button" class="tk-key" data-tk-key="${k}">${k}</button>`))
          .join('')}</div>`,
      ).join('')}
      <div class="tk-row">
        <button type="button" class="tk-key tk-wide tk-muted" data-tk-action="clear">Borrar todo</button>
        <button type="button" class="tk-key tk-space" data-tk-key=" " aria-label="Espacio">espacio</button>
        <button type="button" class="tk-key tk-wide tk-enter" data-tk-action="enter"></button>
      </div>
    </div>`;
  document.body.appendChild(panel);

  // pointerdown + preventDefault: el input conserva el foco (y los modales de Bootstrap no lo pierden).
  panel.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    e.preventDefault();
    btn.classList.add('tk-pressed');
    setTimeout(() => btn.classList.remove('tk-pressed'), 120);
    press(btn);
  });
  // Evita el "click fantasma" después del pointerdown.
  panel.addEventListener('click', (e) => e.preventDefault());
}

function press(btn) {
  if (!target) return;
  const action = btn.dataset.tkAction;
  const mode = target.dataset.tk;
  const max = Number(target.dataset.tkMax || target.maxLength) || 60;
  let value = target.value;

  if (action === 'close') return hide();
  if (action === 'enter') {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    target.dispatchEvent(new CustomEvent('tk:enter', { bubbles: true }));
    return hide();
  }
  if (action === 'back') value = value.slice(0, -1);
  else if (action === 'clear') value = '';
  else {
    let key = btn.dataset.tkKey;
    if (mode === 'codigo' && (key === ' ' || key === 'Ñ')) return;
    if (mode !== 'codigo') key = key.toLowerCase();
    if (value.length >= max) return;
    // Primera letra en mayúscula para que la búsqueda se vea prolija.
    if (mode !== 'codigo' && (!value || value.endsWith(' '))) key = key.toUpperCase();
    value += key;
  }

  target.value = value;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  refresh();
}

function refresh() {
  if (!panel || !target) return;
  panel.querySelector('.tk-text').textContent = target.value || target.placeholder || '';
  panel.querySelector('.tk-preview').classList.toggle('tk-placeholder', !target.value);
  panel.querySelector('.tk-enter').innerHTML = `<i class="bi bi-check-lg me-1"></i>${target.dataset.tkEnter || 'Listo'}`;
  panel.classList.toggle('tk-mode-codigo', target.dataset.tk === 'codigo');
}

export function show(input) {
  if (!panel) build();
  target = input;
  refresh();
  panel.classList.add('tk-open');
  document.body.classList.add('tk-visible');
  document.documentElement.style.setProperty('--tk-height', `${panel.offsetHeight}px`);
  // Que el campo quede a la vista por encima del teclado.
  setTimeout(() => input.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
}

export function hide() {
  if (!panel) return;
  panel.classList.remove('tk-open');
  document.body.classList.remove('tk-visible');
  target?.blur();
  target = null;
}

/** Activa el teclado para todos los inputs con [data-tk] (presentes o futuros). */
export function initTouchKeyboard() {
  const prepare = (el) => {
    el.setAttribute('inputmode', 'none');
    el.setAttribute('autocomplete', 'off');
  };
  document.querySelectorAll('input[data-tk]').forEach(prepare);
  new MutationObserver(() => document.querySelectorAll('input[data-tk]:not([inputmode="none"])').forEach(prepare)).observe(document.body, {
    childList: true,
    subtree: true,
  });

  document.addEventListener('focusin', (e) => {
    if (e.target.matches?.('input[data-tk]')) show(e.target);
  });
  // Tocar fuera del teclado y del campo lo cierra.
  document.addEventListener('pointerdown', (e) => {
    if (!panel?.classList.contains('tk-open')) return;
    if (panel.contains(e.target) || e.target === target) return;
    hide();
  });
  // Al abrirse un modal/panel (producto, pago, carrito) el teclado se oculta para no taparlo.
  ['show.bs.modal', 'show.bs.offcanvas'].forEach((ev) => document.addEventListener(ev, hide));
  // Si el valor cambia por código (p. ej. al limpiar), se actualiza la vista previa.
  document.addEventListener('input', (e) => e.target === target && refresh());
}
