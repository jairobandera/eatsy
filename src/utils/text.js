/** Normaliza texto para comparar sin importar mayúsculas ni tildes (en JS). */
export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Patrón para LIKE '%texto%' escapando comodines. En MySQL el escape por defecto es "\".
 * La colación utf8mb4_unicode_ci ya ignora mayúsculas y tildes.
 */
export function likePattern(value) {
  return `%${String(value ?? '').trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
