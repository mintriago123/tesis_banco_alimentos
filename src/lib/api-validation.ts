import { NextResponse } from 'next/server';
import {
  isPlainRecord,
  parseBooleanValue,
  parseEnumValue,
  parseIsoDateValue,
  parseOptionalTextValue,
  parsePositiveIntegerValue,
  parsePositiveNumberValue,
  parseUuidValue,
  type IntegerOptions,
  type NumberOptions,
} from './validation-core';

export type ApiValidationResult<T> =
  | { success: true; value: T }
  | { success: false; response: NextResponse };

const badRequest = (error: string): NextResponse =>
  NextResponse.json({ error }, { status: 400 });

const toApiResult = <T>(
  result: { success: true; value: T } | { success: false; error: string }
): ApiValidationResult<T> =>
  result.success
    ? { success: true, value: result.value }
    : { success: false, response: badRequest(result.error) };

export async function readJsonObject(request: Request): Promise<ApiValidationResult<Record<string, unknown>>> {
  try {
    const body = await request.json();

    if (!isPlainRecord(body)) {
      return {
        success: false,
        response: badRequest('El payload debe ser un objeto JSON.'),
      };
    }

    return { success: true, value: body };
  } catch {
    return {
      success: false,
      response: badRequest('Payload JSON invalido.'),
    };
  }
}

export function parsePositiveIntParam(
  value: unknown,
  options: IntegerOptions
): ApiValidationResult<number> {
  return toApiResult(parsePositiveIntegerValue(value, options));
}

export function parsePositiveNumber(
  value: unknown,
  options: NumberOptions
): ApiValidationResult<number> {
  return toApiResult(parsePositiveNumberValue(value, options));
}

export function parseEnumParam<T extends string>(
  value: unknown,
  allowed: readonly T[],
  options: { name: string; fallback?: T }
): ApiValidationResult<T> {
  return toApiResult(parseEnumValue(value, allowed, options));
}

export function parseUuid(
  value: unknown,
  options: { name: string }
): ApiValidationResult<string> {
  return toApiResult(parseUuidValue(value, options));
}

export function parseOptionalText(
  value: unknown,
  options: { name: string; maxLength: number }
): ApiValidationResult<string | null> {
  return toApiResult(parseOptionalTextValue(value, options));
}

export function parseIsoDateParam(
  value: unknown,
  options: { name: string }
): ApiValidationResult<string | undefined> {
  return toApiResult(parseIsoDateValue(value, options));
}

export function parseBooleanParam(
  value: unknown,
  options: { name: string; fallback?: boolean }
): ApiValidationResult<boolean | undefined> {
  return toApiResult(parseBooleanValue(value, options));
}

export function parsePaginationParams(
  searchParams: URLSearchParams,
  { defaultLimit, maxLimit }: { defaultLimit: number; maxLimit: number }
): ApiValidationResult<{ limit: number; offset: number }> {
  const limit = parsePositiveIntParam(searchParams.get('limit'), {
    name: 'limit',
    fallback: defaultLimit,
    min: 1,
    max: maxLimit,
  });

  if (!limit.success) {
    return limit;
  }

  const offset = parsePositiveIntParam(searchParams.get('offset'), {
    name: 'offset',
    fallback: 0,
    min: 0,
    max: 100000,
  });

  if (!offset.success) {
    return offset;
  }

  return {
    success: true,
    value: {
      limit: limit.value,
      offset: offset.value,
    },
  };
}

