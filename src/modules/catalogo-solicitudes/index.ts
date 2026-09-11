export * from './actions';
export * from './types';
// `./service` is server-only (Drizzle) — import it directly from server code.
// `./client` (aprobarSolicitudViaApi) is browser-safe — import it directly
// from client components rather than through this barrel, so a client bundle
// never pulls in the server-only barrel entries above.
