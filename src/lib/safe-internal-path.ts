const ALLOWED_INTERNAL_PATH_PREFIXES = [
  '/admin',
  '/operador',
  '/donante',
  '/user',
  '/perfil',
  '/notificaciones',
  '/comprobante',
  '/auth',
] as const;

const INTERNAL_URL_ORIGIN = 'https://banco-alimentos.local';
const URL_SCHEME_REGEX = /^[a-z][a-z\d+.-]*:/i;
const DISALLOWED_RAW_CHARS_REGEX = /[\s\\\u0000-\u001F\u007F]/;
const DISALLOWED_DECODED_CHARS_REGEX = /[\s\\\u0000-\u001F\u007F]/;
const SCHEME_REFERENCE_REGEX = /(?:^|[/?#&=])[a-z][a-z\d+.-]*:/i;
const DOT_SEGMENT_REGEX = /(?:^|\/)\.{1,2}(?:\/|$)/;

const hasAllowedPrefix = (pathname: string) =>
  ALLOWED_INTERNAL_PATH_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

const decodePathname = (pathname: string) => {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
};

export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  if (
    DISALLOWED_RAW_CHARS_REGEX.test(value) ||
    URL_SCHEME_REGEX.test(value) ||
    SCHEME_REFERENCE_REGEX.test(value) ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('//')
  ) {
    return null;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value, INTERNAL_URL_ORIGIN);
  } catch {
    return null;
  }

  if (parsedUrl.origin !== INTERNAL_URL_ORIGIN) {
    return null;
  }

  const decodedPathname = decodePathname(parsedUrl.pathname);

  if (
    !decodedPathname ||
    DISALLOWED_DECODED_CHARS_REGEX.test(decodedPathname) ||
    decodedPathname.includes('//') ||
    DOT_SEGMENT_REGEX.test(decodedPathname) ||
    !hasAllowedPrefix(decodedPathname)
  ) {
    return null;
  }

  return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
}
