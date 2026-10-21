import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';
import { obtenerConfig, paletaMarca, versionConfig } from '../services/config.service.js';

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

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapar = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * Marca del negocio (la define el superadmin): nombre en lugar de "Eatsy", su logo y su color.
 * El nombre también queda en <meta name="negocio"> para los títulos que arma el JavaScript.
 */
function conMarca(html) {
  const { negocio } = obtenerConfig();
  const p = paletaMarca(negocio.color);
  const rgb = [1, 3, 5].map((i) => parseInt(p.brand.slice(i, i + 2), 16)).join(', ');
  const estilo = `<style>:root{--brand:${p.brand};--brand-dark:${p.dark};--brand-soft:${p.soft};--brand-light:${p.light};--brand-rgb:${rgb};--bs-link-color:${p.dark}}</style>`;
  const meta = `<meta name="negocio" content="${escapar(negocio.nombre)}">`;
  return html
    .replace(/Eatsy/g, escapar(negocio.nombre))
    .replaceAll('/img/logo.png', `/negocio/logo?v=${versionConfig()}`)
    .replace(/<meta name="theme-color" content="[^"]*">/, `<meta name="theme-color" content="${p.brand}">`)
    .replace('</head>', `  ${meta}\n  ${estilo}\n</head>`);
}

const cache = new Map();

/** Al cambiar la marca o el paquete, las páginas se vuelven a armar. */
export const invalidarPaginas = () => cache.clear();

/** HTML de una página de public/ con JS y CSS versionados y la marca del negocio (en producción se calcula una vez). */
export function paginaVersionada(file) {
  if (config.isProduction && cache.has(file)) return cache.get(file);
  const html = conMarca(versionar(fs.readFileSync(path.join(config.paths.public, file), 'utf8'), versiones()));
  if (config.isProduction) cache.set(file, html);
  return html;
}
