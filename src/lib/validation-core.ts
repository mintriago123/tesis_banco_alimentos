export type ValueValidationResult<T> = { success: true; value: T } | { success: false; error: string };

export interface IntegerOptions {
  name: string;
  fallback?: number;
  min?: number;
  max?: number;
}

export interface NumberOptions {
  name: string;
  fallback?: number;
  min?: number;
  max?: number;
}

export interface TextOptions {
  name: string;
  maxLength: number;
}

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STRICT_INTEGER_REGEX = /^(0|[1-9]\d*)$/;
const STRICT_DECIMAL_REGEX = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_REGEX.test(value.trim());

export function parseUuidValue(value: unknown, { name }: { name: string }): ValueValidationResult<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return { success: false, error: `${name} es requerido.` };
  }

  const trimmed = value.trim();
  if (!UUID_REGEX.test(trimmed)) {
    return { success: false, error: `${name} debe ser un UUID valido.` };
  }

  return { success: true, value: trimmed };
}

export function parsePositiveIntegerValue(value: unknown, options: IntegerOptions): ValueValidationResult<number> {
  const { name, fallback, min = 1, max } = options;
  const resolved = value === null || value === undefined || value === '' ? fallback : value;

  if (resolved === undefined) {
    return { success: false, error: `${name} es requerido.` };
  }

  let parsed: number;

  if (typeof resolved === 'number') {
    if (!Number.isInteger(resolved)) {
      return { success: false, error: `${name} debe ser un entero.` };
    }
    parsed = resolved;
  } else if (typeof resolved === 'string') {
    const trimmed = resolved.trim();
    if (!STRICT_INTEGER_REGEX.test(trimmed)) {
      return { success: false, error: `${name} debe ser un entero.` };
    }
    parsed = Number(trimmed);
  } else {
    return { success: false, error: `${name} debe ser un entero.` };
  }

  if (!Number.isSafeInteger(parsed)) {
    return { success: false, error: `${name} esta fuera del rango seguro.` };
  }

  if (parsed < min) {
    return { success: false, error: `${name} debe ser mayor o igual a ${min}.` };
  }

  if (max !== undefined && parsed > max) {
    return { success: false, error: `${name} debe ser menor o igual a ${max}.` };
  }

  return { success: true, value: parsed };
}

export function parsePositiveNumberValue(value: unknown, options: NumberOptions): ValueValidationResult<number> {
  const { name, fallback, min, max } = options;
  const resolved = value === null || value === undefined || value === '' ? fallback : value;

  if (resolved === undefined) {
    return { success: false, error: `${name} es requerido.` };
  }

  let parsed: number;

  if (typeof resolved === 'number') {
    parsed = resolved;
  } else if (typeof resolved === 'string') {
    const trimmed = resolved.trim();
    if (!STRICT_DECIMAL_REGEX.test(trimmed)) {
      return { success: false, error: `${name} debe ser un numero positivo.` };
    }
    parsed = Number(trimmed);
  } else {
    return { success: false, error: `${name} debe ser un numero positivo.` };
  }

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { success: false, error: `${name} debe ser un numero positivo.` };
  }

  if (min !== undefined && parsed < min) {
    return { success: false, error: `${name} debe ser mayor o igual a ${min}.` };
  }

  if (max !== undefined && parsed > max) {
    return { success: false, error: `${name} debe ser menor o igual a ${max}.` };
  }

  return { success: true, value: parsed };
}

export function parseFiniteNumberValue(value: unknown, options: NumberOptions): ValueValidationResult<number> {
  const { name, fallback, min, max } = options;
  const resolved = value === null || value === undefined || value === '' ? fallback : value;

  if (resolved === undefined) {
    return { success: false, error: `${name} es requerido.` };
  }

  const parsed =
    typeof resolved === 'number'
      ? resolved
      : typeof resolved === 'string' && STRICT_DECIMAL_REGEX.test(resolved.trim())
        ? Number(resolved.trim())
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return { success: false, error: `${name} debe ser un numero finito.` };
  }

  if (min !== undefined && parsed < min) {
    return { success: false, error: `${name} debe ser mayor o igual a ${min}.` };
  }

  if (max !== undefined && parsed > max) {
    return { success: false, error: `${name} debe ser menor o igual a ${max}.` };
  }

  return { success: true, value: parsed };
}

export function parseEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  options: { name: string; fallback?: T },
): ValueValidationResult<T> {
  const { name, fallback } = options;
  const resolved = value === null || value === undefined || value === '' ? fallback : value;

  if (resolved === undefined) {
    return { success: false, error: `${name} es requerido.` };
  }

  if (typeof resolved !== 'string' || !allowed.includes(resolved as T)) {
    return { success: false, error: `${name} invalido. Opciones: ${allowed.join(', ')}.` };
  }

  return { success: true, value: resolved as T };
}

export function parseOptionalTextValue(
  value: unknown,
  { name, maxLength }: TextOptions,
): ValueValidationResult<string | null> {
  if (value === null || value === undefined || value === '') {
    return { success: true, value: null };
  }

  if (typeof value !== 'string') {
    return { success: false, error: `${name} debe ser texto.` };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { success: true, value: null };
  }

  if (trimmed.length > maxLength) {
    return { success: false, error: `${name} no debe superar ${maxLength} caracteres.` };
  }

  return { success: true, value: trimmed };
}

export function parseIsoDateValue(
  value: unknown,
  { name }: { name: string },
): ValueValidationResult<string | undefined> {
  if (value === null || value === undefined || value === '') {
    return { success: true, value: undefined };
  }

  if (typeof value !== 'string') {
    return { success: false, error: `${name} debe ser una fecha ISO valida.` };
  }

  const trimmed = value.trim();
  const dateOnly = DATE_ONLY_REGEX.exec(trimmed);

  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return { success: false, error: `${name} debe ser una fecha ISO valida.` };
    }

    return { success: true, value: trimmed };
  }

  if (!ISO_DATE_TIME_REGEX.test(trimmed)) {
    return { success: false, error: `${name} debe ser una fecha ISO valida.` };
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return { success: false, error: `${name} debe ser una fecha ISO valida.` };
  }

  return { success: true, value: date.toISOString() };
}

export function parseBooleanValue(
  value: unknown,
  { name, fallback }: { name: string; fallback?: boolean },
): ValueValidationResult<boolean | undefined> {
  if (value === null || value === undefined || value === '') {
    return { success: true, value: fallback };
  }

  if (typeof value === 'boolean') {
    return { success: true, value };
  }

  if (value === 'true') {
    return { success: true, value: true };
  }

  if (value === 'false') {
    return { success: true, value: false };
  }

  return { success: false, error: `${name} debe ser true o false.` };
}

export function parsePositiveIntegerArrayValue(
  value: unknown,
  options: IntegerOptions & { maxItems: number },
): ValueValidationResult<number[]> {
  const { name, maxItems } = options;

  if (!Array.isArray(value)) {
    return { success: false, error: `${name} debe ser una lista.` };
  }

  if (value.length === 0) {
    return { success: false, error: `${name} debe contener al menos un elemento.` };
  }

  if (value.length > maxItems) {
    return { success: false, error: `${name} no debe superar ${maxItems} elementos.` };
  }

  const parsed = new Set<number>();

  for (const item of value) {
    const itemResult = parsePositiveIntegerValue(item, options);
    if (!itemResult.success) {
      return { success: false, error: itemResult.error };
    }
    parsed.add(itemResult.value);
  }

  return { success: true, value: [...parsed] };
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
