import crypto from 'node:crypto';

// Hash de contraseñas con scrypt (nativo de Node). Formato: scrypt$<salt>$<hash>
const KEY_LENGTH = 64;

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(plain, stored) {
  const [algo, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(plain), salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}
