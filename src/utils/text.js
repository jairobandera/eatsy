/** Normaliza texto para comparar sin importar mayúsculas ni tildes (en JS). */
export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Patrón para LIKE '%texto%' escapando comodines. El escape por defecto de PostgreSQL es "\".
 * Para ignorar mayúsculas y tildes las consultas comparan norm(columna) LIKE norm(?).
 */
export function likePattern(value) {
  return `%${String(value ?? '').trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
