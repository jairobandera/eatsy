/* global bootstrap */
import { api } from '../core/api.js';
import { mountLayout } from '../core/layout.js';
import { marcarTrabajoEnCurso } from '../core/realtime.js';
import { confirmDialog, debounce, escapeHtml, html, renderPagination, showError, toast, withLoading } from '../core/ui.js';

/**
 * Página CRUD genérica con:
 *  - pestañas Activos / Deshabilitados, búsqueda y paginación;
 *  - modal de alta/edición;
 *  - deshabilitar / habilitar (baja lógica).
 *
 * @param {object} cfg
 * @param {string} cfg.endpoint     ej. '/admin/categorias'
 * @param {string} cfg.title        título de la página
 * @param {string} cfg.icon         ícono bootstrap-icons
 * @param {string} cfg.singular     ej. 'categoría'
 * @param {{label:string, render:(item)=>string, class?:string}[]} cfg.columns
 * @param {(item:object|null)=>string} cfg.form       HTML del formulario
 * @param {(form:HTMLFormElement, item:object|null)=>object|FormData} cfg.read  arma el body
 * @param {(item:object|null)=>Promise<void>} [cfg.beforeOpen]  carga datos antes de dibujar el form
 * @param {(form:HTMLFormElement, item:object|null)=>void|Promise<void>} [cfg.onOpen]
 * @param {string} [cfg.modalSize]  'modal-lg' | 'modal-xl'
 * @param {(item)=>boolean} [cfg.canDisable]
 * @param {(saved:object, info:{nuevo:boolean})=>void} [cfg.afterSave]  se llama después de guardar
 */
export async function createCrudPage(cfg) {
  const user = await mountLayout('admin');
  const app = document.getElementById('app');
  const state = { estado: 'activos', buscar: '', page: 1, items: [] };

  app.innerHTML = `
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div>
        <h1 class="page-title h3"><i class="bi bi-${cfg.icon} text-brand me-2"></i>${cfg.title}</h1>
        ${cfg.subtitle ? `<p class="text-muted mb-0 small">${cfg.subtitle}</p>` : ''}
      </div>
      <button class="btn btn-brand rounded-pill px-4" id="btn-nuevo"><i class="bi bi-plus-lg me-1"></i>Nuevo ${cfg.singular}</button>
    </div>

    <div class="card-app p-3 mb-3">
      <div class="row g-2 align-items-center">
        <div class="col-md-auto">
          <ul class="nav nav-pills" id="tabs-estado">
            <li class="nav-item"><button class="nav-link active" data-estado="activos"><i class="bi bi-check-circle me-1"></i>Activos</button></li>
            <li class="nav-item"><button class="nav-link" data-estado="inactivos"><i class="bi bi-slash-circle me-1"></i>Deshabilitados</button></li>
          </ul>
        </div>
        <div class="col-md">
          <div class="input-group">
            <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
            <input type="search" class="form-control" id="buscar" placeholder="Buscar por nombre..." autocomplete="off">
          </div>
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-responsive">
        <table class="table table-app table-hover align-middle">
          <thead><tr>${cfg.columns.map((c) => `<th class="${c.class || ''}">${c.label}</th>`).join('')}<th class="text-end">Acciones</th></tr></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
    <div class="mt-3" id="paginacion"></div>

    <div class="modal fade" id="crud-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-scrollable ${cfg.modalSize || ''}">
        <form class="modal-content" id="crud-form" novalidate>
          <div class="modal-header">
            <h5 class="modal-title" id="crud-title"></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body" id="crud-body"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary rounded-pill" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-brand rounded-pill px-4" data-loading-text="Guardando..."><i class="bi bi-save me-1"></i>Guardar</button>
          </div>
        </form>
      </div>
    </div>`;

  const tbody = app.querySelector('#tbody');
  const modalEl = app.querySelector('#crud-modal');
  const modal = new bootstrap.Modal(modalEl);
  // Con el formulario abierto, un cambio de configuración no recarga la página (avisa).
  marcarTrabajoEnCurso(() => modalEl.classList.contains('show'));
  const form = app.querySelector('#crud-form');
  let editing = null;

  async function load() {
    const colspan = cfg.columns.length + 1;
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-4"><div class="spinner-border text-secondary"></div></td></tr>`;
    try {
      const res = await api.get(cfg.endpoint, { estado: state.estado, buscar: state.buscar, page: state.page, per_page: cfg.perPage || 10 });
      if (res.page > res.last_page && res.page > 1) {
        state.page = res.last_page;
        return load();
      }
      state.items = res.data;
      tbody.innerHTML = res.data.length
        ? res.data.map(rowHtml).join('')
        : `<tr><td colspan="${colspan}"><div class="empty-state"><i class="bi bi-inbox"></i>${
            state.buscar ? 'No hay resultados para la búsqueda.' : state.estado === 'activos' ? `Todavía no hay registros.` : 'No hay registros deshabilitados.'
          }</div></td></tr>`;
      renderPagination(app.querySelector('#paginacion'), res, (p) => {
        state.page = p;
        load();
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-danger py-4">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function rowHtml(item) {
    const activo = item.activo !== false;
    const canDisable = cfg.canDisable ? cfg.canDisable(item, user) : true;
    const cells = cfg.columns.map((c) => html`<td class="${c.class || ''}">${c.render(item, user)}</td>`).join('');
    const acciones = activo
      ? html`<button class="btn btn-sm btn-outline-primary rounded-pill me-1" data-action="edit" data-id="${item.id}"><i class="bi bi-pencil"></i><span class="d-none d-lg-inline ms-1">Editar</span></button>
             ${canDisable ? html`<button class="btn btn-sm btn-outline-danger rounded-pill" data-action="disable" data-id="${item.id}"><i class="bi bi-slash-circle"></i><span class="d-none d-lg-inline ms-1">Deshabilitar</span></button>` : ''}`
      : html`<button class="btn btn-sm btn-outline-success rounded-pill" data-action="enable" data-id="${item.id}"><i class="bi bi-arrow-counterclockwise"></i><span class="d-none d-lg-inline ms-1">Habilitar</span></button>`;
    return `<tr>${cells}<td class="text-end text-nowrap">${acciones}</td></tr>`;
  }

  async function openForm(item = null) {
    editing = item;
    try {
      await cfg.beforeOpen?.(item);
    } catch (err) {
      return showError(err);
    }
    app.querySelector('#crud-title').textContent = item ? `Editar ${cfg.singular}` : `Nuevo ${cfg.singular}`;
    app.querySelector('#crud-body').innerHTML = cfg.form(item);
    form.classList.remove('was-validated');
    await cfg.onOpen?.(form, item);
    modal.show();
  }

  modalEl.addEventListener('shown.bs.modal', () => form.querySelector('input:not([type=hidden]),textarea,select')?.focus());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }
    let body;
    try {
      body = cfg.read(form, editing);
    } catch (err) {
      return showError(err, 'Revisá el formulario');
    }
    await withLoading(form.querySelector('[type=submit]'), async () => {
      try {
        const saved = editing ? await api.put(`${cfg.endpoint}/${editing.id}`, body) : await api.post(cfg.endpoint, body);
        modal.hide();
        cfg.afterSave?.(saved, { nuevo: !editing });
        toast(editing ? `${capitalize(cfg.singular)} actualizad${cfg.genero || 'o'}` : `${capitalize(cfg.singular)} cread${cfg.genero || 'o'}`);
        if (!editing && state.estado !== 'activos') switchTab('activos');
        else load();
      } catch (err) {
        showError(err, 'No se pudo guardar');
      }
    });
  });

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const item = state.items.find((i) => i.id === id);
    const nombre = item?.nombre || `#${id}`;

    if (btn.dataset.action === 'edit') {
      try {
        const full = cfg.fetchFull ? await api.get(`${cfg.endpoint}/${id}`) : item;
        openForm(full);
      } catch (err) {
        showError(err);
      }
      return;
    }

    const disable = btn.dataset.action === 'disable';
    const ok = await confirmDialog({
      title: disable ? `¿Deshabilitar "${nombre}"?` : `¿Habilitar "${nombre}"?`,
      text: disable ? 'Dejará de estar disponible, pero podrás habilitarlo nuevamente.' : 'Volverá a estar disponible.',
      confirmText: disable ? 'Deshabilitar' : 'Habilitar',
      icon: disable ? 'warning' : 'question',
      danger: disable,
    });
    if (!ok) return;
    try {
      await api.patch(`${cfg.endpoint}/${id}/${disable ? 'deshabilitar' : 'habilitar'}`);
      toast(disable ? 'Deshabilitado' : 'Habilitado');
      load();
    } catch (err) {
      showError(err, 'No se pudo completar la acción');
    }
  });

  function switchTab(estado) {
    state.estado = estado;
    state.page = 1;
    app.querySelectorAll('#tabs-estado .nav-link').forEach((b) => b.classList.toggle('active', b.dataset.estado === estado));
    load();
  }

  app.querySelector('#tabs-estado').addEventListener('click', (e) => {
    const b = e.target.closest('[data-estado]');
    if (b) switchTab(b.dataset.estado);
  });
  app.querySelector('#buscar').addEventListener(
    'input',
    debounce((e) => {
      state.buscar = e.target.value.trim();
      state.page = 1;
      load();
    }, 300),
  );
  app.querySelector('#btn-nuevo').addEventListener('click', () => openForm(null));

  load();
  return { reload: load, user };
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Helpers para formularios */
export const field = (form, name) => form.elements.namedItem(name);
export const value = (form, name) => (field(form, name)?.value ?? '').trim();
