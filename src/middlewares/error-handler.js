import multer from 'multer';
import { HttpError } from '../utils/http-error.js';

export function notFoundApi(req, res) {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, ...(err.details || {}) });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen supera el tamaño máximo (5 MB).' : `Error al subir el archivo: ${err.message}`;
    return res.status(422).json({ message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'JSON inválido en el cuerpo de la petición.' });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Ya existe un registro con esos datos.' });
  }
  if (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('[db]', err.message);
    return res.status(503).json({ message: 'No hay conexión con la base de datos.' });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ message: 'Ocurrió un error inesperado en el servidor.' });
}
