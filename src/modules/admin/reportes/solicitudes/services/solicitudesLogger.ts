export interface SolicitudesLogger {
  info: (message: string, details?: unknown) => void;
  warn: (message: string, details?: unknown) => void;
  error: (message: string, error?: unknown) => void;
}

export const solicitudesLogger: SolicitudesLogger = {
  info: (message: string, details?: unknown) => console.info(`[SolicitudesActionService] ${message}`, details),
  warn: (message: string, details?: unknown) => console.warn(`[SolicitudesActionService] ${message}`, details),
  error: (message: string, error?: unknown) => console.error(`[SolicitudesActionService] ${message}`, error),
};
