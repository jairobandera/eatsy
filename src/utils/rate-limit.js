/**
 * Limitador de intentos en memoria (ventana fija). Sirve para frenar fuerza bruta
 * en el login y en la búsqueda pública de pedidos.
 *
 *   const limiter = createRateLimiter({ max: 5, windowMs: 5 * 60_000 });
 *   if (limiter.blocked(key)) ...; limiter.hit(key); limiter.reset(key);
 */
export function createRateLimiter({ max, windowMs }) {
  const entries = new Map();

  const current = (key) => {
    const e = entries.get(key);
    if (e && Date.now() - e.since > windowMs) {
      entries.delete(key);
      return null;
    }
    return e;
  };

  // Limpieza periódica para que el Map no crezca indefinidamente.
  const timer = setInterval(() => {
    for (const key of entries.keys()) current(key);
  }, windowMs);
  timer.unref?.();

  return {
    blocked: (key) => (current(key)?.count ?? 0) >= max,
    hit(key) {
      const e = current(key);
      if (e) e.count += 1;
      else entries.set(key, { since: Date.now(), count: 1 });
    },
    reset: (key) => entries.delete(key),
  };
}
