/* global bootstrap */
import { api } from '../core/api.js';
import { mountLayout } from '../core/layout.js';
import { confirmDialog, escapeHtml, html, money, showError, toast, withLoading } from '../core/ui.js';

await mountLayout('admin');
const app = document.getElementById('app');

app.innerHTML = `
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div>
      <h1 class="page-title h3"><i class="bi bi-star text-brand me-2"></i>Reglas de puntos</h1>
      <p class="text-muted mb-0 small">Cuando un pedido con cliente asociado se entrega, se otorgan puntos según el tramo de su total.
      Si el total no cae en ningún tramo, se otorga 1 punto.</p>
    </div>
    <button class="btn btn-brand rounded-pill px-4" id="btn-nueva"><i class="bi bi-plus-lg me-1"></i>Nuevo tramo</button>
  </div>
  <div class="row g-4">
    <div class="col-lg-8">
      <div class="table-wrap">
        <table class="table table-app align-middle">
          <thead><tr><th>Desde</th><th>Hasta</th><th>Puntos</th><th class="text-end">Acciones</th></tr></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
    <div class="col-lg-4">
      <div class="card-app p-4">
        <h2 class="h6 fw-semibold"><i class="bi bi-calculator me-1"></i>Simulador</h2>
        <p class="small text-muted">Probá cuántos puntos genera un pedido.</p>
        <div class="input-group mb-2"><span class="input-group-text">$</span><input type="number" min="0" step="0.01" class="form-control" id="sim-monto" placeholder="Total del pedido"></div>
        <div class="fs-5" id="sim-resultado"></div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="modal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
      <form class="modal-content" id="form" novalidate>
        <div class="modal-header"><h5 class="modal-title" id="modal-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-6"><label class="form-label fw-medium" for="monto_min">Monto desde</label>
              <div class="input-group"><span class="input-group-text">$</span><input type="number" class="form-control" id="monto_min" name="monto_min" min="0" step="0.01" required></div></div>
            <div class="col-6"><label class="form-label fw-medium" for="monto_max">Monto hasta</label>
              <div class="input-group"><span class="input-group-text">$</span><input type="number" class="form-control" id="monto_max" name="monto_max" min="0" step="0.01" required></div></div>
            <div class="col-12"><label class="form-label fw-medium" for="puntos_base">Puntos a otorgar</label>
              <input type="number" class="form-control" id="puntos_base" name="puntos_base" min="1" step="1" required></div>
          </div>
          <div class="form-text mt-2">Los tramos no pueden superponerse.</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary rounded-pill" data-bs-dismiss="modal">Cancelar</button>
          <button type="submit" class="btn btn-brand rounded-pill px-4" data-loading-text="Guardando..."><i class="bi bi-save me-1"></i>Guardar</button>
        </div>
      </form>
    </div>
  </div>`;

const tbody = app.querySelector('#tbody');
const modal = new bootstrap.Modal(app.querySelector('#modal'));
const form = app.querySelector('#form');
let reglas = [];
let editando = null;

async function load() {
  try {
    reglas = await api.get('/admin/reglas-puntos');
    tbody.innerHTML = reglas.length
      ? reglas
          .map(
            (r) => html`<tr>
              <td>${money(r.monto_min)}</td><td>${money(r.monto_max)}</td>
              <td><span class="badge rounded-pill bg-brand fs-6"><i class="bi bi-star-fill me-1"></i>${r.puntos_base}</span></td>
              <td class="text-end text-nowrap">
                <button class="btn btn-sm btn-outline-primary rounded-pill me-1" data-edit="${r.id}"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger rounded-pill" data-del="${r.id}"><i class="bi bi-trash"></i></button>
              </td></tr>`,
          )
          .join('')
      : '<tr><td colspan="4"><div class="empty-state"><i class="bi bi-star"></i>No hay tramos. Todos los pedidos otorgan 1 punto.</div></td></tr>';
    simular();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">${escapeHtml(err.message)}</td></tr>`;
  }
}

function abrir(regla) {
  editando = regla;
  app.querySelector('#modal-title').textContent = regla ? 'Editar tramo' : 'Nuevo tramo';
  form.reset();
  form.classList.remove('was-validated');
  if (regla) for (const k of ['monto_min', 'monto_max', 'puntos_base']) form.elements[k].value = regla[k];
  else if (reglas.length) form.elements.monto_min.value = (Number(reglas.at(-1).monto_max) + 0.01).toFixed(2);
  modal.show();
}

function simular() {
  const monto = Number(app.querySelector('#sim-monto').value);
  const out = app.querySelector('#sim-resultado');
  if (!app.querySelector('#sim-monto').value) return (out.innerHTML = '');
  const r = [...reglas].sort((a, b) => b.monto_min - a.monto_min).find((x) => x.monto_min <= monto && x.monto_max >= monto);
  out.innerHTML = `<i class="bi bi-star-fill text-warning me-1"></i><b>${r ? r.puntos_base : 1}</b> punto(s)`;
}

app.querySelector('#sim-monto').addEventListener('input', simular);
app.querySelector('#btn-nueva').addEventListener('click', () => abrir(null));

tbody.addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (edit) abrir(reglas.find((r) => r.id === Number(edit.dataset.edit)));
  if (del) {
    if (!(await confirmDialog({ title: '¿Eliminar este tramo?', confirmText: 'Eliminar', danger: true, icon: 'warning' }))) return;
    try {
      await api.delete(`/admin/reglas-puntos/${del.dataset.del}`);
      toast('Tramo eliminado');
      load();
    } catch (err) {
      showError(err);
    }
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.checkValidity()) return form.classList.add('was-validated');
  const body = Object.fromEntries(['monto_min', 'monto_max', 'puntos_base'].map((k) => [k, Number(form.elements[k].value)]));
  if (body.monto_max <= body.monto_min) return showError(new Error('"Hasta" debe ser mayor que "Desde".'));
  await withLoading(form.querySelector('[type=submit]'), async () => {
    try {
      if (editando) await api.put(`/admin/reglas-puntos/${editando.id}`, body);
      else await api.post('/admin/reglas-puntos', body);
      modal.hide();
      toast('Tramo guardado');
      load();
    } catch (err) {
      showError(err, 'No se pudo guardar');
    }
  });
});

load();
