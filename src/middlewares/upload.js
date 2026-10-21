import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import config from '../config/index.js';
import { unprocessable } from '../utils/http-error.js';

const DEST = path.join(config.paths.uploads, 'productos');
fs.mkdirSync(DEST, { recursive: true });

const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: DEST,
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXTENSIONS[file.mimetype]}`),
});

/** Subida de imágenes de productos (campo `imagen`, máx. 5 MB). */
export const uploadImagenProducto = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXTENSIONS[file.mimetype]) return cb(unprocessable('La imagen debe ser JPG, PNG, GIF o WEBP.'));
    cb(null, true);
  },
}).single('imagen');

/**
 * Logo del negocio (campo `logo`, máx. 300 KB). Queda en memoria: se guarda en la base porque el
 * disco de Render se borra en cada deploy.
 */
export const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXTENSIONS[file.mimetype]) return cb(unprocessable('El logo debe ser JPG, PNG, GIF o WEBP.'));
    cb(null, true);
  },
}).single('logo');

/** Ruta pública de un archivo subido. */
export const publicUploadPath = (file) => (file ? `/uploads/productos/${file.filename}` : null);
