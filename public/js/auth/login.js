import { api } from '../core/api.js';
import { withLoading } from '../core/ui.js';

const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');
const pass = document.getElementById('contrasena');

document.getElementById('toggle-pass').addEventListener('click', (e) => {
  const show = pass.type === 'password';
  pass.type = show ? 'text' : 'password';
  e.currentTarget.innerHTML = `<i class="bi bi-eye${show ? '-slash' : ''}"></i>`;
});

/** Solo permite redirigir a rutas internas (evita open redirect). */
function safeNext(home) {
  const next = new URLSearchParams(location.search).get('next');
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login')) return next;
  return home;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.add('d-none');
  const data = Object.fromEntries(new FormData(form));
  if (!data.nombre.trim() || !data.contrasena) {
    errorBox.textContent = 'Completá usuario y contraseña.';
    errorBox.classList.remove('d-none');
    return;
  }

  await withLoading(form.querySelector('[type=submit]'), async () => {
    try {
      const { home } = await api.post('/auth/login', data);
      window.location.href = safeNext(home);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('d-none');
      pass.select();
    }
  });
});

// En modo demo mostramos los usuarios de prueba (un toque completa el formulario).
const DEMO_USERS = [
  ['Admin', 'Administración'],
  ['Cajero1', 'Caja'],
  ['Cocina1', 'Cocina'],
  ['Kiosco1', 'Kiosco'],
];
api
  .get('/auth/info')
  .then(({ modo }) => {
    if (modo !== 'demo') return;
    const box = document.getElementById('demo-users');
    box.innerHTML = DEMO_USERS.map(
      ([u, label]) => `<button type="button" class="btn btn-sm btn-outline-dark rounded-pill" data-user="${u}">${label} <small class="text-muted">(${u})</small></button>`,
    ).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-user]');
      if (!b) return;
      form.nombre.value = b.dataset.user;
      pass.value = '123456789';
      form.requestSubmit();
    });
    document.getElementById('demo-info').classList.remove('d-none');
  })
  .catch(() => {});
