import { api } from '../core/api.js';
import { mountLayout } from '../core/layout.js';
import { escapeHtml, html, showError, toast, withLoading } from '../core/ui.js';

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
  ok: ['text-success', 'Activa'],
  por_vencer: ['text-warning', 'Por vencer'],
  vencida: ['text-danger', 'Vencida: el negocio no puede usar la app'],
  suspendida: ['text-danger', 'Suspendida: el negocio no puede usar la app'],
};

let datos = null;

function render() {
  const { config: c, usuarios, licencia } = datos;
  const [cls, texto] = ESTADO_LICENCIA[licencia.estado] || ESTADO_LICENCIA.ok;
  app.innerHTML = html`
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div>
        <h1 class="page-title h3 mb-0"><i class="bi bi-shield-lock text-brand me-2"></i>Configuración de la instalación</h1>
        <p class="text-muted small mb-0">Solo vos ves esta pantalla. Los cambios aplican al instante en todas las pantallas del negocio.</p>
      </div>
      <a class="btn btn-outline-secondary rounded-pill" href="/admin"><i class="bi bi-box-arrow-up-right me-1"></i>Ir al panel del negocio</a>
    </div>

    <form id="form" novalidate>
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
            <label class="form-label fw-medium" for="l-vence">Pago hasta</label>
            <input type="date" class="form-control mb-1" id="l-vence" value="${c.licencia.vence || ''}">
            <div class="form-text mb-3">Vacío = sin vencimiento. 7 días antes se le avisa al administrador; al día siguiente del vencimiento se bloquea.</div>
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
  form.addEventListener('change', (e) => {
    if (['p-full', 'p-totem', 'p-cocina'].includes(e.target.id)) actualizarPaquete();
  });
  form.querySelector('#n-color').addEventListener('input', actualizarColor);
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
    licencia: { vence: f.querySelector('#l-vence').value || null, suspendida: f.querySelector('#l-suspendida').checked, motivo: f.querySelector('#l-motivo').value.trim() },
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

try {
  datos = await api.get('/superadmin');
  render();
} catch (err) {
  app.innerHTML = `<div class="text-danger">${escapeHtml(err.message)}</div>`;
}
