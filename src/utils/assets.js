import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';

/**
 * "Cache busting" de JS y CSS: cada página pide sus archivos con ?v=<hash del contenido>.
 * Si un archivo cambia en un deploy, cambia su URL y ningún navegador puede seguir usando
 * una copia vieja (por ejemplo, un celular que guardó la versión anterior).
 *
 *  - <script src> y <link href> de /js y /css llevan su ?v=.
 *  - Los módulos que se importan entre sí (import '../core/api.js') se versionan con un
 *    import map que se inserta en la página.
 */
const hash = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 10);

function listar(dir, ext) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listar(full, ext));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

/** { '/js/core/api.js': '/js/core/api.js?v=ab12...' , ... } */
function versiones() {
  const map = {};
  for (const [carpeta, ext] of [['js', '.js'], ['css', '.css']]) {
    const base = path.join(config.paths.public, carpeta);
    for (const file of listar(base, ext)) {
      const url = `/${path.relative(config.paths.public, file).split(path.sep).join('/')}`;
      map[url] = `${url}?v=${hash(file)}`;
    }
  }
  return map;
}

function versionar(html, map) {
  const imports = Object.fromEntries(Object.entries(map).filter(([url]) => url.endsWith('.js')));
  const importMap = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
  const conVersion = html.replace(/(src|href)="(\/(?:js|css)\/[^"?#]+)"/g, (m, attr, url) => (map[url] ? `${attr}="${map[url]}"` : m));
  // El import map tiene que estar antes del primer módulo.
  return conVersion.includes('<script') ? conVersion.replace('<script', `${importMap}\n  <script`) : conVersion;
}

const cache = new Map();

/** HTML de una página de public/ con JS y CSS versionados (en producción se calcula una vez). */
export function paginaVersionada(file) {
  if (config.isProduction && cache.has(file)) return cache.get(file);
  const html = versionar(fs.readFileSync(path.join(config.paths.public, file), 'utf8'), versiones());
  if (config.isProduction) cache.set(file, html);
  return html;
}
