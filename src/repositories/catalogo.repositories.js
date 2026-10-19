import { sql } from '../db/connection.js';
import { createRepository, toBool } from './base.repository.js';

export const categoriasRepo = createRepository({ table: 'categorias' });

export const ingredientesRepo = createRepository({ table: 'ingredientes' });

export const usuariosRepo = {
  ...createRepository({
    table: 'usuarios',
    select: 'id, nombre, rol, activo, created_at, updated_at',
  }),

  /** Incluye el hash de la contraseña: solo para autenticación. */
  async findForLogin(nombre) {
    return toBool(await sql.get('SELECT * FROM usuarios WHERE nombre = ? LIMIT 1', [String(nombre).trim()]), 'activo');
  },

  async countActiveAdmins({ excludeId = 0 } = {}) {
    const row = await sql.get(
      `SELECT COUNT(*) AS c FROM usuarios WHERE rol = 'Administrador' AND activo = 1 AND id <> ?`,
      [excludeId],
    );
    return Number(row.c);
  },
};
