/* global bootstrap */
import { api } from '../core/api.js';
import { debounce, escapeHtml, html, showError, toast, withLoading } from '../core/ui.js';

/**
 * Panel de cliente de la caja: buscar por cédula (con puntos), asociar, registrar y editar.
 * @param {HTMLElement} container
 * @param {(cliente:object|null)=>void} onChange
 */
export function initClientes(container, onChange) {
  let cliente = null;

  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="modal fade" id="modal-cliente" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog"><form class="modal-content" id="form-cliente" novalidate>
        <div class="modal-header"><h5 class="modal-title" id="cliente-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <div class="mb-3"><label class="form-label fw-medium" for="c-cedula">Cédula <span class="text-danger">*</span></label>
            <input class="form-control" id="c-cedula" name="cedula" inputmode="numeric" maxlength="20" required pattern="[0-9.\\-]+">
            <div class="invalid-feedback">Ingresá una cédula válida (solo números).</div></div>
          <div class="row g-2 mb-3">
            <div class="col-6"><label class="form-label fw-medium" for="c-nombre">Nombre <span class="text-danger">*</span></label>
              <input class="form-control" id="c-nombre" name="nombre" maxlength="50" required></div>
            <div class="col-6"><label class="form-label fw-medium" for="c-apellido">Apellido <span class="text-danger">*</span></label>
              <input class="form-control" id="c-apellido" name="apellido" maxlength="50" required></div>
          </div>
          <label class="form-label fw-medium" for="c-telefono">Teléfono</label>
          <input class="form-control" id="c-telefono" name="telefono" inputmode="tel" maxlength="20">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary rounded-pill" data-bs-dismiss="modal">Cancelar</button>
          <button type="submit" class="btn btn-success rounded-pill px-4" data-loading-text="Guardando..."><i class="bi bi-save me-1"></i>Guardar</button>
        </div>
      </form></div>
    </div>`,
  );

  const modalEl = document.getElementById('modal-cliente');
  const modal = new bootstrap.Modal(modalEl);
  const form = document.getElementById('form-cliente');
  let editando = null;

  function abrirForm(c = null, cedulaInicial = '') {
    editando = c;
    form.reset();
    form.classList.remove('was-validated');
    modalEl.querySelector('#cliente-title').textContent = c ? 'Editar cliente' : 'Registrar cliente';
    form.cedula.value = c?.cedula || cedulaInicial;
    form.cedula.readOnly = Boolean(c);
    form.nombre.value = c?.nombre || '';
    form.apellido.value = c?.apellido || '';
    form.telefono.value = c?.telefono || '';
    modal.show();
    setTimeout(() => (c || cedulaInicial ? form.nombre : form.cedula).focus(), 300);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) return form.classList.add('was-validated');
    const body = { nombre: form.nombre.value.trim(), apellido: form.apellido.value.trim(), telefono: form.telefono.value.trim() || null };
    await withLoading(form.querySelector('[type=submit]'), async () => {
      try {
        const guardado = editando
          ? await api.put(`/caja/clientes/${editando.id}`, body)
          : await api.post('/caja/clientes', { ...body, cedula: form.cedula.value.trim() });
        modal.hide();
        toast(editando ? 'Cliente actualizado' : 'Cliente registrado y asociado');
        set(guardado);
      } catch (err) {
        showError(err, 'No se pudo guardar el cliente');
      }
    });
  });

  function set(c) {
    cliente = c;
    render();
    onChange(c);
  }

  function render() {
    if (cliente) {
      container.innerHTML = html`
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="small text-muted">Cliente asociado</div>
            <div class="fw-semibold">${cliente.nombre} ${cliente.apellido}</div>
            <div class="small text-muted">CI ${cliente.cedula}${cliente.telefono ? ` · ${cliente.telefono}` : ''}</div>
          </div>
          <span class="badge rounded-pill text-bg-warning fs-6" title="Puntos acumulados"><i class="bi bi-star-fill me-1"></i>${cliente.puntos ?? 0}</span>
        </div>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-outline-primary rounded-pill" data-act="editar"><i class="bi bi-pencil me-1"></i>Editar</button>
          <button class="btn btn-sm btn-outline-danger rounded-pill" data-act="quitar"><i class="bi bi-x-lg me-1"></i>Quitar</button>
        </div>`.toString();
      return;
    }
    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h2 class="h6 fw-semibold mb-0"><i class="bi bi-person me-1"></i>Cliente <small class="text-muted fw-normal">(opcional, suma puntos)</small></h2>
      </div>
      <div class="position-relative">
        <div class="input-group input-group-sm">
          <span class="input-group-text bg-white"><i class="bi bi-person-vcard"></i></span>
          <input type="search" class="form-control" id="cliente-buscar" placeholder="Buscar por cédula (mín. 3 dígitos)" inputmode="numeric" autocomplete="off">
          <button class="btn btn-success" data-act="nuevo" title="Registrar cliente"><i class="bi bi-person-plus"></i></button>
        </div>
        <div class="list-group position-absolute w-100 shadow-sm z-3 mt-1" id="cliente-resultados"></div>
      </div>`;
    const input = container.querySelector('#cliente-buscar');
    const resultados = container.querySelector('#cliente-resultados');
    let lista = [];

    input.addEventListener(
      'input',
      debounce(async () => {
        const q = input.value.replace(/\D/g, '');
        if (q.length < 3) return (resultados.innerHTML = '');
        try {
          lista = await api.get('/caja/clientes', { cedula: q });
          resultados.innerHTML = lista.length
            ? lista
                .map(
                  (c) => html`<button type="button" class="list-group-item list-group-item-action small ${c.activo ? '' : 'disabled'}" data-cli="${c.id}">
                    <div class="d-flex justify-content-between"><span><b>${c.cedula}</b> · ${c.nombre} ${c.apellido}${c.activo ? '' : ' (inactivo)'}</span>
                    <span class="text-warning"><i class="bi bi-star-fill"></i> ${c.puntos}</span></div></button>`,
                )
                .join('')
            : html`<div class="list-group-item small text-muted">Sin coincidencias. <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-act="nuevo" data-cedula="${q}">Registrar ${q}</button></div>`.toString();
        } catch (err) {
          resultados.innerHTML = `<div class="list-group-item small text-danger">${escapeHtml(err.message)}</div>`;
        }
      }, 300),
    );
    resultados.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cli]');
      if (b) set(lista.find((c) => c.id === Number(b.dataset.cli)));
    });
  }

  container.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'nuevo') abrirForm(null, b.dataset.cedula || container.querySelector('#cliente-buscar')?.value.replace(/\D/g, '') || '');
    if (b.dataset.act === 'editar') abrirForm(cliente);
    if (b.dataset.act === 'quitar') set(null);
  });

  render();
  return { set, get: () => cliente };
}
