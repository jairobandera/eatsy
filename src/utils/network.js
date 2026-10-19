import os from 'node:os';

/**
 * IPv4 de la red local (Wi-Fi/Ethernet) para que los celulares puedan entrar.
 * Prioriza rangos domésticos típicos y descarta adaptadores virtuales comunes.
 */
export function localIPv4() {
  const VIRTUAL = /virtual|vmware|vbox|hyper-v|vethernet|wsl|docker|loopback|bluetooth/i;
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) candidates.push(a.address);
    }
  }
  const score = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  return candidates.sort((a, b) => score(a) - score(b))[0] || 'localhost';
}

/** URL base pública: PUBLIC_URL del .env o http://<ip-local>:<puerto>. */
export function publicBaseUrl(config) {
  if (config.publicUrl) return config.publicUrl.replace(/\/+$/, '');
  return `http://${localIPv4()}:${config.port}`;
}
