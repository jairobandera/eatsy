/**
 * Traduce las consultas de la app (placeholders `?`, estilo mysql2) al formato de PostgreSQL ($1, $2...).
 * Así los repositorios siguen escribiendo `?` y pasando arrays/objetos como antes:
 *
 *   'id IN (?)', [[1, 2, 3]]                    -> 'id IN ($1, $2, $3)'
 *   'INSERT INTO t SET ?', [{ a: 1, b: 2 }]     -> 'INSERT INTO t ("a", "b") VALUES ($1, $2)'
 *   'UPDATE t SET ? WHERE id = ?', [{ a: 1 }, 5] -> 'UPDATE t SET "a" = $1 WHERE id = $2'
 *   'INSERT INTO t (a, b) VALUES ?', [[[1, 2], [3, 4]]] -> '... VALUES ($1, $2), ($3, $4)'
 *
 * Los `?` dentro de textos entre comillas o comentarios `--` no se tocan. Los booleanos se mandan
 * como 1/0 (las columnas "booleanas" son SMALLINT 0/1, igual que en MySQL).
 */

const esObjetoPlano = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v);

const columna = (nombre) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(nombre)) throw new Error(`Nombre de columna inválido: ${nombre}`);
  return `"${nombre}"`;
};

const valor = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v);

/** @returns {{ text: string, values: any[] }} */
export function convertirConsulta(query, params = []) {
  const values = [];
  const ph = (v) => {
    values.push(valor(v));
    return `$${values.length}`;
  };
  let out = '';
  let i = 0;
  let p = 0;
  while (i < query.length) {
    const ch = query[i];
    // Textos entre comillas simples o dobles: se copian tal cual.
    if (ch === "'" || ch === '"') {
      const fin = query.indexOf(ch, i + 1);
      const hasta = fin === -1 ? query.length : fin + 1;
      out += query.slice(i, hasta);
      i = hasta;
      continue;
    }
    // Comentario de línea.
    if (ch === '-' && query[i + 1] === '-') {
      const fin = query.indexOf('\n', i);
      const hasta = fin === -1 ? query.length : fin;
      out += query.slice(i, hasta);
      i = hasta;
      continue;
    }
    if (ch !== '?') {
      out += ch;
      i++;
      continue;
    }
    if (p >= params.length) throw new Error('Faltan parámetros para la consulta.');
    const v = params[p++];
    i++;
    if (Array.isArray(v)) {
      if (v.length && Array.isArray(v[0])) {
        // VALUES ? con varias filas
        out += v.map((fila) => `(${fila.map(ph).join(', ')})`).join(', ');
      } else {
        // IN (?): lista vacía = ninguna coincidencia
        out += v.length ? v.map(ph).join(', ') : 'NULL';
      }
    } else if (esObjetoPlano(v)) {
      const claves = Object.keys(v);
      if (!claves.length) throw new Error('Objeto vacío en la consulta.');
      const insert = out.match(/INSERT\s+INTO\s+(\S+)\s+SET\s*$/i);
      if (insert) {
        out = out.slice(0, insert.index) + `INSERT INTO ${insert[1]} (${claves.map(columna).join(', ')}) VALUES (${claves.map((k) => ph(v[k])).join(', ')})`;
      } else {
        out += claves.map((k) => `${columna(k)} = ${ph(v[k])}`).join(', ');
      }
    } else {
      out += ph(v);
    }
  }
  if (p < params.length) throw new Error('Sobran parámetros para la consulta.');
  // Para poder devolver insertId como en MySQL.
  if (/^\s*INSERT\b/i.test(out) && !/\bRETURNING\b/i.test(out)) out += ' RETURNING *';
  return { text: out, values };
}
