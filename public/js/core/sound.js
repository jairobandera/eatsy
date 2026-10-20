/**
 * Sonidos de aviso. Los navegadores bloquean el audio hasta que el usuario
 * interactúa con la página, así que "desbloqueamos" en el primer click/tecla.
 */
const sounds = {
  pedido: new Audio('/sounds/bell.mp3'),
  llamado: new Audio('/sounds/llamado-cliente.mp3'),
  // Aviso suave para el mozo cuando una mesa lo llama (no molesta al resto del salón).
  mesa: new Audio('/sounds/llamado-mozo.mp3'),
};
Object.values(sounds).forEach((a) => (a.preload = 'auto'));

let unlocked = false;
let muted = false;
try {
  muted = localStorage.getItem('ap_muted') === '1';
} catch {
  /* sin storage */
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  Object.values(sounds).forEach((a) => {
    a.muted = true;
    a.play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
      })
      .catch(() => {
        a.muted = false;
      });
  });
}
['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, unlock, { once: true, capture: true }));

export function play(name) {
  if (muted) return;
  const audio = sounds[name];
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem('ap_muted', value ? '1' : '0');
  } catch {
    /* sin storage */
  }
}
