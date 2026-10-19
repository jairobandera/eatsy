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
