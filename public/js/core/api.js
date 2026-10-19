/**
 * Cliente HTTP de la API. Maneja JSON, FormData, errores y sesión vencida.
 */
export class ApiError extends Error {
  constructor(status, data) {
    super(data?.message || `Error ${status}`);
    this.status = status;
    this.data = data;
  }
}

function buildUrl(path, query) {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  return url;
}

export async function request(path, { method = 'GET', body, query, signal } = {}) {
  const headers = { Accept: 'application/json', 'X-Requested-With': 'fetch' };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(buildUrl(path, query), { method, headers, body: payload, credentials: 'same-origin', signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, { message: 'No hay conexión con el servidor.' });
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  // Sesión vencida → login. (Excepto en rutas públicas/de seguimiento: el celular del cliente nunca va al login.)
  if (res.status === 401 && !/^\/(auth|seguimiento|publico)(\/|$)/.test(path)) {
    window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    throw new ApiError(401, data);
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (path, query, opts) => request(path, { ...opts, query }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
