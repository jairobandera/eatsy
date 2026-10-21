import { api } from '../core/api.js';
import { mountLayout } from '../core/layout.js';
import { escapeHtml, html, money, raw, showError, toast, withLoading } from '../core/ui.js';

/**
 * Panel del superadmin (solo el proveedor de la app): paquete, licencia, marca, límites y módulos
 * de esta instalación. Lo que se guarda aplica al instante en todas las pantallas del negocio.
 */
await mountLayout('superadmin');
const app = document.getElementById('app');

const ROLES = [
  ['Administrador', 'Administrador', 'shield-lock'],
  ['Cajero', 'Cajero', 'cash-stack'],
  ['Cocina', 'Cocina', 'fire'],
  ['Mozo', 'Mozo', 'grid-3x3-gap'],
  ['Cliente', 'Kiosco', 'tablet'],
];
const MODULOS = [
  ['cupones', 'Cupones de descuento', 'Códigos que el cliente ingresa en el kiosco o el cajero en la caja.'],
  ['puntos', 'Puntos de clientes', 'Programa de fidelidad: los clientes suman puntos por compra (caja).'],
  ['seguimiento', 'Seguimiento por QR', 'QR en la pantalla de llamados para seguir el pedido desde el celular.'],
  ['estadisticas', 'Estadísticas', 'Ventas, productos más vendidos y reporte en PDF para el administrador.'],
];
const ESTADO_LICENCIA = {
  gratis: ['text-success', 'Gratuita (sin vencimiento)'],
  ok: ['text-success', 'Activa'],
  por_vencer: ['text-warning', 'Por vencer'],
  vencida: ['text-danger', 'Vencida: el negocio no puede usar la app'],
  suspendida: ['text-danger', 'Suspendida: el negocio no puede usar la app'],
};

let datos = null;
const COLOR_EATSY = '#ff5722'; // color por defecto de la marca
let pestana = 'config';

function render() {
  const { config: c, usuarios, licencia } = datos;
  const [cls, texto] = ESTADO_LICENCIA[licencia.estado] || ESTADO_LICENCIA.ok;
  app.innerHTML = html`
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div>
        <h1 class="page-title h3 mb-0"><i class="bi bi-shield-lock text-brand me-2"></i>Configuración de la instalación</h1>
        <p class="text-muted small mb-0">Solo vos ves esta pantalla. Los cambios aplican al instante en todas las pantallas del negocio.</p>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <a class="btn btn-outline-primary rounded-pill" href="/api/superadmin/respaldo" download title="Base completa en un archivo .sql"><i class="bi bi-database-down me-1"></i>Descargar respaldo</a>
        <a class="btn btn-outline-secondary rounded-pill" href="/admin"><i class="bi bi-box-arrow-up-right me-1"></i>Ir al panel del negocio</a>
      </div>
    </div>

    <ul class="nav nav-pills mb-3" id="tabs">
      <li class="nav-item"><button type="button" class="nav-link ${pestana === 'config' ? 'active' : ''}" data-tab="config"><i class="bi bi-sliders me-1"></i>Esta instalación</button></li>
      <li class="nav-item"><button type="button" class="nav-link ${pestana === 'instalaciones' ? 'active' : ''}" data-tab="instalaciones"><i class="bi bi-buildings me-1"></i>Todas mis instalaciones</button></li>
    </ul>

    <div id="pane-instalaciones" ${pestana === 'instalaciones' ? '' : 'hidden'}></div>

    <form id="form" novalidate ${pestana === 'config' ? '' : 'hidden'}>
      <div class="row g-3">
        <div class="col-lg-6">
          <section class="card-app sa-card h-100">
            <h2><i class="bi bi-box-seam"></i>Paquete</h2>
            <div class="row g-2 mb-3">
              <div class="col-6">
                <input type="radio" class="btn-check" name="tipo" id="p-full" value="full" ${c.paquete.tipo === 'full' ? 'checked' : ''}>
                <label class="paquete-opcion" for="p-full"><div class="titulo">Full</div><div class="small text-muted">Todo: kiosco, caja, cocina, mozos con mesas, llamados y administración.</div></label>
              </div>
              <div class="col-6">
                <input type="radio" class="btn-check" name="tipo" id="p-totem" value="totem" ${c.paquete.tipo === 'totem' ? 'checked' : ''}>
                <label class="paquete-opcion" for="p-totem"><div class="titulo">Tótem</div><div class="small text-muted">Kiosco de autoservicio, pantalla de llamados y administración. Sin caja ni mozos.</div></label>
              </div>
            </div>
            <div class="form-check form-switch mb-3" id="cocina-wrap">
              <input class="form-check-input" type="checkbox" role="switch" id="p-cocina" ${c.paquete.cocina ? 'checked' : ''}>
              <label class="form-check-label" for="p-cocina">Incluye usuario de <b>Cocina</b></label>
              <div class="form-text">Sin cocina, los pedidos los atiende el administrador desde la pantalla de cocina.</div>
            </div>
            <div class="small text-muted mb-1">Accesos habilitados:</div>
            <div id="roles-habilitados"></div>
          </section>
        </div>

        <div class="col-lg-6">
          <section class="card-app sa-card h-100">
            <h2><i class="bi bi-calendar-check"></i>Licencia</h2>
            <p class="mb-3">Estado: <span class="licencia-estado ${cls}">${texto}</span>${licencia.vence ? html` · vence el <b>${licencia.vence.split('-').reverse().join('/')}</b>` : ''}</p>
            <div class="btn-group w-100 mb-3" role="group" aria-label="Tipo de licencia">
              <input type="radio" class="btn-check" name="l-tipo" id="l-pago" value="pago" ${c.licencia.tipo !== 'gratis' ? 'checked' : ''}>
              <label class="btn btn-outline-brand" for="l-pago"><i class="bi bi-credit-card me-1"></i>De pago</label>
              <input type="radio" class="btn-check" name="l-tipo" id="l-gratis" value="gratis" ${c.licencia.tipo === 'gratis' ? 'checked' : ''}>
              <label class="btn btn-outline-brand" for="l-gratis"><i class="bi bi-gift me-1"></i>Gratuita</label>
            </div>
            <div id="vence-wrap">
              <label class="form-label fw-medium" for="l-vence">Pago hasta</label>
              <input type="date" class="form-control mb-1" id="l-vence" value="${c.licencia.vence || ''}">
              <div class="form-text mb-3">Vacío = sin vencimiento. 7 días antes se le avisa al administrador; al día siguiente del vencimiento se bloquea.</div>
            </div>
            <div class="form-text mb-3" id="gratis-texto">Sin vencimiento: funciona hasta que la pases a <b>De pago</b> o la suspendas.</div>
            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" role="switch" id="l-suspendida" ${c.licencia.suspendida ? 'checked' : ''}>
              <label class="form-check-label fw-medium" for="l-suspendida">Suspender el servicio ahora</label>
            </div>
            <input type="text" class="form-control" id="l-motivo" maxlength="200" placeholder="Motivo (solo lo ves vos)" value="${c.licencia.motivo || ''}">
          </section>
        </div>

        <div class="col-lg-6">
          <section class="card-app sa-card h-100">
            <h2><i class="bi bi-shop"></i>Negocio</h2>
            <label class="form-label fw-medium" for="n-nombre">Nombre</label>
            <input type="text" class="form-control mb-3" id="n-nombre" maxlength="60" required value="${c.negocio.nombre}">
            <label class="form-label fw-medium" for="n-color">Color principal</label>
            <div class="d-flex align-items-center gap-2 mb-3">
              <input type="color" class="form-control form-control-color" id="n-color" value="${c.negocio.color}">
              <div class="color-preview" id="color-preview"></div>
              <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill ms-auto" id="color-defecto" title="Volver al naranja de Eatsy (${COLOR_EATSY})"><i class="bi bi-arrow-counterclockwise me-1"></i>Color de Eatsy</button>
            </div>
            <label class="form-label fw-medium">Logo</label>
            <div class="d-flex align-items-center gap-3">
              <div class="logo-preview"><img src="/negocio/logo?t=${Date.now()}" alt="Logo"></div>
              <div class="d-flex flex-column gap-2">
                <label class="btn btn-sm btn-outline-primary rounded-pill mb-0"><i class="bi bi-upload me-1"></i>Subir logo<input type="file" id="n-logo" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
                ${c.negocio.tiene_logo ? html`<button type="button" class="btn btn-sm btn-outline-danger rounded-pill" id="quitar-logo"><i class="bi bi-x-lg me-1"></i>Usar el de Eatsy</button>` : ''}
              </div>
            </div>
            <div class="form-text">PNG, JPG, WEBP o GIF, máximo 300 KB. Se ve en el kiosco, la pantalla de llamados, los tickets y el login.</div>
          </section>
        </div>

        <div class="col-lg-6">
          <section class="card-app sa-card h-100">
            <h2><i class="bi bi-people"></i>Límites de usuarios</h2>
            <p class="small text-muted">Cantidad máxima de usuarios <b>activos</b> por tipo. Vacío = sin límite.</p>
            ${ROLES.map(
              ([rol, label, icon]) => html`<div class="d-flex align-items-center gap-2 mb-2">
                <i class="bi bi-${icon} text-muted"></i>
                <label class="flex-grow-1 mb-0" for="lim-${rol}">${label} <span class="small text-muted">(hoy: ${usuarios[rol] || 0})</span></label>
                <input type="number" class="form-control form-control-sm" style="max-width: 90px" id="lim-${rol}" min="${rol === 'Administrador' ? 1 : 0}" max="999" value="${c.limites[rol] ?? ''}" placeholder="∞">
              </div>`,
            )}
          </section>
        </div>

        <div class="col-12">
          <section class="card-app sa-card">
            <h2><i class="bi bi-toggles"></i>Módulos</h2>
            <div class="row g-3">
              ${MODULOS.map(
                ([m, titulo, desc]) => html`<div class="col-md-6 col-xl-3"><div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" role="switch" id="m-${m}" ${c.modulos[m] !== false ? 'checked' : ''}>
                  <label class="form-check-label fw-medium" for="m-${m}">${titulo}</label>
                  <div class="form-text">${desc}</div></div></div>`,
              )}
            </div>
          </section>
        </div>
      </div>

      <div class="sa-guardar text-end">
        <button type="submit" class="btn btn-brand btn-lg rounded-pill px-5" id="guardar" data-loading-text="Guardando..."><i class="bi bi-save me-1"></i>Guardar cambios</button>
      </div>
    </form>`.toString();

  const form = app.querySelector('#form');
  const actualizarPaquete = () => {
    const totem = form.querySelector('#p-totem').checked;
    form.querySelector('#cocina-wrap').hidden = !totem;
    const roles = totem ? ['Administrador', 'Cliente', ...(form.querySelector('#p-cocina').checked ? ['Cocina'] : [])] : ROLES.map((r) => r[0]);
    form.querySelector('#roles-habilitados').innerHTML = ROLES.map(
      ([rol, label, icon]) => `<span class="rol-chip ${roles.includes(rol) ? 'on' : ''}"><i class="bi bi-${roles.includes(rol) ? 'check-lg' : 'x-lg'}"></i>${escapeHtml(label)}</span>`,
    ).join('');
  };
  const actualizarColor = () => {
    const color = form.querySelector('#n-color').value;
    form.querySelector('#color-preview').innerHTML = [color, `color-mix(in srgb, ${color} 88%, black)`, `color-mix(in srgb, ${color} 8%, white)`]
      .map((c) => `<span style="background:${c}"></span>`)
      .join('');
  };
  const actualizarLicencia = () => {
    const gratis = form.querySelector('#l-gratis').checked;
    form.querySelector('#vence-wrap').hidden = gratis;
    form.querySelector('#gratis-texto').hidden = !gratis;
  };
  form.addEventListener('change', (e) => {
    if (['p-full', 'p-totem', 'p-cocina'].includes(e.target.id)) actualizarPaquete();
    if (e.target.name === 'l-tipo') actualizarLicencia();
  });
  app.querySelector('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    pestana = b.dataset.tab;
    app.querySelectorAll('#tabs .nav-link').forEach((x) => x.classList.toggle('active', x === b));
    form.hidden = pestana !== 'config';
    app.querySelector('#pane-instalaciones').hidden = pestana !== 'instalaciones';
    if (pestana === 'instalaciones') cargarInstalaciones();
  });
  if (pestana === 'instalaciones') cargarInstalaciones();
  actualizarLicencia();
  form.querySelector('#n-color').addEventListener('input', actualizarColor);
  form.querySelector('#color-defecto').addEventListener('click', () => {
    form.querySelector('#n-color').value = COLOR_EATSY;
    actualizarColor();
    toast('Color de Eatsy elegido: tocá Guardar cambios para aplicarlo', 'info', { timer: 3500 });
  });
  form.querySelector('#n-logo').addEventListener('change', subirLogo);
  form.querySelector('#quitar-logo')?.addEventListener('click', quitarLogo);
  form.addEventListener('submit', guardar);
  actualizarPaquete();
  actualizarColor();
}

function leer() {
  const f = app.querySelector('#form');
  const num = (id) => (f.querySelector(id).value === '' ? null : Number(f.querySelector(id).value));
  return {
    paquete: { tipo: f.querySelector('[name=tipo]:checked').value, cocina: f.querySelector('#p-cocina').checked },
    licencia: { tipo: f.querySelector('[name=l-tipo]:checked').value, vence: f.querySelector('#l-vence').value || null, suspendida: f.querySelector('#l-suspendida').checked, motivo: f.querySelector('#l-motivo').value.trim() },
    negocio: { nombre: f.querySelector('#n-nombre').value.trim(), color: f.querySelector('#n-color').value },
    limites: Object.fromEntries(ROLES.map(([rol]) => [rol, num(`#lim-${rol}`)])),
    modulos: Object.fromEntries(MODULOS.map(([m]) => [m, f.querySelector(`#m-${m}`).checked])),
  };
}

async function guardar(e) {
  e.preventDefault();
  const body = leer();
  if (!body.negocio.nombre) return showError(new Error('Ingresá el nombre del negocio.'));
  await withLoading(app.querySelector('#guardar'), async () => {
    try {
      datos = await api.put('/superadmin', body);
      toast('Configuración guardada');
      render();
    } catch (err) {
      showError(err, 'No se pudo guardar');
    }
  });
}

async function subirLogo(e) {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('logo', file);
  try {
    datos = await api.post('/superadmin/logo', fd);
    toast('Logo actualizado');
    render();
  } catch (err) {
    showError(err, 'No se pudo subir el logo');
  }
}

async function quitarLogo() {
  try {
    datos = await api.delete('/superadmin/logo');
    toast('Se usa el logo de Eatsy');
    render();
  } catch (err) {
    showError(err);
  }
}

// ───────────── Todas mis instalaciones (panel central) ─────────────
let panel = null;
let editando = false;

const tarjetaLicencia = (lic) => {
  const [cls, texto] = ESTADO_LICENCIA[lic.estado] || ESTADO_LICENCIA.ok;
  const vence = lic.vence ? ` · vence ${lic.vence.split('-').reverse().join('/')}` : '';
  return html`<span class="${cls} fw-semibold">${texto.split(':')[0]}</span><span class="text-muted">${vence}</span>`;
};

function filaInstalacion(i) {
  const e = i.estado;
  if (!i.ok) {
    return html`<tr class="table-light">
      <td><div class="fw-semibold">${i.nombre || i.url}</div><a class="small text-muted" href="${i.url}" target="_blank" rel="noopener">${i.url}</a></td>
      <td colspan="5" class="text-danger small"><i class="bi bi-wifi-off me-1"></i>${i.error}</td>
      <td class="text-end"><a class="btn btn-sm btn-outline-secondary rounded-pill" href="${i.url}/login" target="_blank" rel="noopener">Abrir</a></td>
    </tr>`;
  }
  const usuarios = Object.entries(e.usuarios || {}).map(([rol, n]) => `${n} ${rol === 'Cliente' ? 'kiosco' : rol.toLowerCase()}`).join(' · ');
  return html`<tr>
    <td><div class="fw-semibold">${e.nombre}${i.propia ? html` <span class="badge text-bg-light border">esta</span>` : ''}</div><a class="small text-muted" href="${i.url}" target="_blank" rel="noopener">${i.url}</a></td>
    <td><span class="badge rounded-pill ${e.paquete.tipo === 'totem' ? 'text-bg-info' : 'text-bg-dark'}">${e.paquete.tipo === 'totem' ? `Tótem${e.paquete.cocina ? ' + cocina' : ''}` : 'Full'}</span></td>
    <td class="small">${tarjetaLicencia(e.licencia)}</td>
    <td class="small text-nowrap">${e.hoy.pedidos} pedidos<div class="text-muted">${money(e.hoy.ventas)}</div></td>
    <td class="small text-nowrap">${e.mes.pedidos} pedidos<div class="text-muted">${money(e.mes.ventas)}</div></td>
    <td class="small">${usuarios || '—'}<div class="text-muted">Último pedido: ${e.ultimo_pedido ? e.ultimo_pedido.slice(0, 16) : '—'}${e.version ? ` · v${e.version}` : ''}</div></td>
    <td class="text-end text-nowrap"><a class="btn btn-sm btn-outline-primary rounded-pill" href="${i.propia ? '/superadmin' : `${i.url}/login`}" ${i.propia ? '' : raw('target="_blank" rel="noopener"')}>${i.propia ? 'Estás acá' : 'Administrar'}</a></td>
  </tr>`;
}

function renderInstalaciones() {
  const pane = app.querySelector('#pane-instalaciones');
  if (!panel) {
    pane.innerHTML = '<div class="card-app p-5 text-center"><div class="spinner-border text-secondary"></div><div class="small text-muted mt-2">Consultando tus instalaciones (si alguna estaba dormida puede tardar hasta 30 s)…</div></div>';
    return;
  }
  const todas = [panel.esta, ...panel.instalaciones];
  const caidas = panel.instalaciones.filter((i) => !i.ok).length;
  pane.innerHTML = html`
    ${panel.clave_configurada
      ? ''
      : html`<div class="alert alert-warning small"><i class="bi bi-key me-1"></i>Para ver las demás instalaciones definí la misma <b>SUPERADMIN_API_KEY</b> (24 caracteres o más) en todas, en Render → Environment.</div>`}
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
      <div class="small text-muted">${todas.length} instalación${todas.length === 1 ? '' : 'es'}${caidas ? html` · <span class="text-danger">${caidas} sin respuesta</span>` : ''}</div>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" id="inst-recargar"><i class="bi bi-arrow-clockwise me-1"></i>Actualizar</button>
        <button type="button" class="btn btn-sm btn-brand rounded-pill" id="inst-editar"><i class="bi bi-pencil me-1"></i>${editando ? 'Cerrar' : 'Agregar / quitar'}</button>
      </div>
    </div>
    ${editando ? editorInstalaciones() : ''}
    <div class="table-wrap"><div class="table-responsive"><table class="table table-app align-middle mb-0">
      <thead><tr><th>Negocio</th><th>Paquete</th><th>Licencia</th><th>Hoy</th><th>Este mes</th><th>Usuarios</th><th></th></tr></thead>
      <tbody>${todas.map(filaInstalacion)}</tbody>
    </table></div></div>`.toString();

  pane.querySelector('#inst-recargar').onclick = () => cargarInstalaciones({ forzar: true });
  pane.querySelector('#inst-editar').onclick = () => {
    editando = !editando;
    renderInstalaciones();
  };
  pane.querySelector('#inst-form')?.addEventListener('submit', guardarInstalaciones);
  pane.querySelector('#inst-form')?.addEventListener('click', (e) => {
    const quitar = e.target.closest('[data-quitar]');
    if (quitar) quitar.closest('.inst-item').remove();
    if (e.target.closest('#inst-agregar')) {
      e.target.closest('form').querySelector('#inst-items').insertAdjacentHTML('beforeend', itemEditor({ nombre: '', url: '' }));
    }
  });
}

const itemEditor = (i) => html`<div class="row g-2 mb-2 inst-item">
    <div class="col-md-4"><input class="form-control form-control-sm" name="nombre" maxlength="60" placeholder="Nombre (opcional)" value="${i.nombre}"></div>
    <div class="col-md"><input class="form-control form-control-sm" name="url" type="url" required placeholder="https://eatsy-negocio.onrender.com" value="${i.url}"></div>
    <div class="col-md-auto"><button type="button" class="btn btn-sm btn-outline-danger rounded-pill w-100" data-quitar aria-label="Quitar"><i class="bi bi-trash"></i></button></div>
  </div>`;

function editorInstalaciones() {
  return html`<form class="card-app p-3 mb-3" id="inst-form" novalidate>
    <div class="small text-muted mb-2">Direcciones de tus otras instalaciones (la de este negocio ya está incluida). Cada una tiene que tener la misma <b>SUPERADMIN_API_KEY</b>.</div>
    <div id="inst-items">${(panel.instalaciones || []).map((i) => itemEditor(i))}</div>
    <div class="d-flex justify-content-between">
      <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" id="inst-agregar"><i class="bi bi-plus-lg me-1"></i>Agregar instalación</button>
      <button type="submit" class="btn btn-sm btn-brand rounded-pill px-4" data-loading-text="Guardando..."><i class="bi bi-save me-1"></i>Guardar lista</button>
    </div>
  </form>`;
}

async function cargarInstalaciones({ forzar = false } = {}) {
  if (panel && !forzar) return renderInstalaciones();
  panel = null;
  renderInstalaciones();
  try {
    panel = await api.get('/superadmin/instalaciones');
    renderInstalaciones();
  } catch (err) {
    app.querySelector('#pane-instalaciones').innerHTML = `<div class="text-danger">${escapeHtml(err.message)}</div>`;
  }
}

async function guardarInstalaciones(e) {
  e.preventDefault();
  const form = e.target;
  const lista = [...form.querySelectorAll('.inst-item')]
    .map((row) => ({ nombre: row.querySelector('[name=nombre]').value.trim(), url: row.querySelector('[name=url]').value.trim() }))
    .filter((i) => i.url);
  await withLoading(form.querySelector('[type=submit]'), async () => {
    try {
      panel = null;
      renderInstalaciones();
      panel = await api.put('/superadmin/instalaciones', { lista });
      editando = false;
      toast('Lista de instalaciones guardada');
      renderInstalaciones();
    } catch (err) {
      showError(err, 'No se pudo guardar');
      cargarInstalaciones({ forzar: true });
    }
  });
}

try {
  datos = await api.get('/superadmin');
  render();
} catch (err) {
  app.innerHTML = `<div class="text-danger">${escapeHtml(err.message)}</div>`;
}
