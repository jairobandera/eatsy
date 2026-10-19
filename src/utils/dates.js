import config from '../config/index.js';

// 'sv-SE' formatea como 'YYYY-MM-DD HH:MM:SS', ideal para guardar/comparar como texto.
const dateTimeFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: config.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Fecha y hora actual del local: 'YYYY-MM-DD HH:MM:SS'. */
export function now(date = new Date()) {
  return dateTimeFmt.format(date).replace('T', ' ');
}

/** Fecha actual del local: 'YYYY-MM-DD'. */
export function today(date = new Date()) {
  return now(date).slice(0, 10);
}

/** Suma días a una fecha 'YYYY-MM-DD' y devuelve 'YYYY-MM-DD'. */
export function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isValidYmd(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
