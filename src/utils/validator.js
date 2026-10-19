import { unprocessable } from './http-error.js';
import { isValidYmd } from './dates.js';

/**
 * Validador liviano basado en esquemas.
 *
 *   validate(req.body, {
 *     nombre: { type: 'string', required: true, maxLength: 255 },
 *     precio: { type: 'number', required: true, min: 0 },
 *   });
 *
 * Devuelve un objeto limpio (solo con los campos del esquema) o lanza 422
 * con { errors: { campo: 'mensaje' } }.
 */
export function validate(input, schema) {
  const data = {};
  const errors = {};
  const source = input ?? {};

  for (const [field, rules] of Object.entries(schema)) {
    const label = rules.label || field;
    let value = source[field];

    if (typeof value === 'string' && rules.type !== 'string') value = value.trim();
    if (value === '' && rules.type !== 'string') value = undefined;

    if (value === undefined || value === null) {
      if (rules.required) errors[field] = `El campo ${label} es obligatorio.`;
      else if ('default' in rules) data[field] = rules.default;
      else if (field in source) data[field] = null;
      continue;
    }

    const result = checkValue(value, rules, label);
    if (result.error) errors[field] = result.error;
    else data[field] = result.value;
  }

  if (Object.keys(errors).length) {
    throw unprocessable(Object.values(errors)[0], { errors });
  }
  return data;
}

function checkValue(value, rules, label) {
  switch (rules.type) {
    case 'string': {
      if (typeof value !== 'string' && typeof value !== 'number') return { error: `${label} debe ser texto.` };
      const str = String(value).trim();
      if (rules.required && !str) return { error: `El campo ${label} es obligatorio.` };
      if (rules.minLength && str.length < rules.minLength)
        return { error: `${label} debe tener al menos ${rules.minLength} caracteres.` };
      if (rules.maxLength && str.length > rules.maxLength)
        return { error: `${label} no puede superar ${rules.maxLength} caracteres.` };
      if (rules.pattern && str && !rules.pattern.test(str)) return { error: rules.patternMessage || `${label} no es válido.` };
      return { value: str === '' && !rules.required ? null : str };
    }
    case 'number':
    case 'integer': {
      const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
      if (!Number.isFinite(num)) return { error: `${label} debe ser un número.` };
      if (rules.type === 'integer' && !Number.isInteger(num)) return { error: `${label} debe ser un número entero.` };
      if (rules.min !== undefined && num < rules.min) return { error: `${label} debe ser mayor o igual a ${rules.min}.` };
      if (rules.max !== undefined && num > rules.max) return { error: `${label} debe ser menor o igual a ${rules.max}.` };
      return { value: num };
    }
    case 'boolean': {
      if (typeof value === 'boolean') return { value };
      if (['1', 'true', 'on', 1].includes(value)) return { value: true };
      if (['0', 'false', 'off', 0].includes(value)) return { value: false };
      return { error: `${label} debe ser verdadero o falso.` };
    }
    case 'enum': {
      if (!rules.values.includes(value)) return { error: `${label} debe ser uno de: ${rules.values.join(', ')}.` };
      return { value };
    }
    case 'date': {
      if (!isValidYmd(value)) return { error: `${label} debe ser una fecha válida (AAAA-MM-DD).` };
      return { value };
    }
    case 'array': {
      let arr = value;
      if (typeof arr === 'string') {
        try {
          arr = JSON.parse(arr);
        } catch {
          arr = arr.split(',');
        }
      }
      if (!Array.isArray(arr)) return { error: `${label} debe ser una lista.` };
      if (rules.min !== undefined && arr.length < rules.min)
        return { error: rules.minMessage || `${label} debe tener al menos ${rules.min} elemento(s).` };
      if (!rules.items) return { value: arr };
      const out = [];
      for (let i = 0; i < arr.length; i++) {
        const item = rules.items.type === 'object' ? checkObject(arr[i], rules.items.schema) : checkValue(arr[i], rules.items, `${label}[${i + 1}]`);
        if (item.error) return { error: item.error };
        out.push(item.value);
      }
      return { value: rules.unique ? [...new Set(out)] : out };
    }
    default:
      return { value };
  }
}

function checkObject(value, schema) {
  if (!value || typeof value !== 'object') return { error: 'Formato de ítem inválido.' };
  try {
    return { value: validate(value, schema) };
  } catch (err) {
    return { error: err.message };
  }
}

/** Lee parámetros de paginación de la query. */
export function pagination(query, defaultPerPage = 10, maxPerPage = 100) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const perPage = Math.min(maxPerPage, Math.max(1, Number.parseInt(query.per_page, 10) || defaultPerPage));
  return { page, perPage, offset: (page - 1) * perPage };
}

export function paginated(data, total, { page, perPage }) {
  return { data, page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) };
}

/** Convierte un parámetro de ruta en id numérico positivo. */
export function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw unprocessable('Identificador inválido.');
  return id;
}
