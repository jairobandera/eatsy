/** Error con código HTTP que el manejador global convierte en respuesta JSON. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'No autenticado.') => new HttpError(401, msg);
export const forbidden = (msg = 'No tenés permisos para esta acción.') => new HttpError(403, msg);
export const notFound = (msg = 'Recurso no encontrado.') => new HttpError(404, msg);
export const conflict = (msg, details) => new HttpError(409, msg, details);
export const unprocessable = (msg, details) => new HttpError(422, msg, details);
