import 'server-only';

import { NextResponse } from 'next/server';

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const forbidden = () =>
  NextResponse.json({ error: 'Origen de la solicitud no permitido.' }, { status: 403 });

const serverMisconfiguration = (message: string) =>
  NextResponse.json({ error: message }, { status: 500 });

const normalizeOrigin = (value: string): string | null => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const isLocalhostOrigin = (origin: string): boolean => {
  try {
    const { hostname } = new URL(origin);
    return LOCALHOST_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
};

const addOrigin = (origins: Set<string>, value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  const normalized = normalizeOrigin(value);
  if (!normalized) {
    return false;
  }

  origins.add(normalized);
  return true;
};

export function validateCsrfRequest(request: Request): NextResponse | null {
  const allowedOrigins = new Set<string>();
  const appOrigin = process.env.APP_ORIGIN?.trim();

  if (appOrigin) {
    if (!addOrigin(allowedOrigins, appOrigin)) {
      return serverMisconfiguration('APP_ORIGIN no es una URL válida.');
    }
  } else if (process.env.NODE_ENV === 'production') {
    return serverMisconfiguration('APP_ORIGIN es obligatorio en producción.');
  }

  if (process.env.NODE_ENV !== 'production') {
    const requestOrigin = normalizeOrigin(request.url);

    if (requestOrigin && isLocalhostOrigin(requestOrigin)) {
      allowedOrigins.add(requestOrigin);
    }
  }

  const source = request.headers.get('origin') ?? request.headers.get('referer');

  if (!source) {
    return forbidden();
  }

  const sourceOrigin = normalizeOrigin(source);

  if (!sourceOrigin || !allowedOrigins.has(sourceOrigin)) {
    return forbidden();
  }

  return null;
}
