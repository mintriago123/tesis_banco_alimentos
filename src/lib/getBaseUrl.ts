/**
 * Base URL for the running app. Prefers an explicit `APP_ORIGIN`, otherwise
 * falls back to localhost for local development.
 */
export function getBaseUrl(): string {
  if (process.env.APP_ORIGIN) {
    return process.env.APP_ORIGIN.replace(/\/$/, '');
  }

  return 'http://localhost:3000';
}

export function getBaseUrlClient(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return getBaseUrl();
}
