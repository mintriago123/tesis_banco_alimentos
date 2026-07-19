export interface SolicitudesLogger {
  info: (message: string, details?: unknown) => void;
  warn: (message: string, details?: unknown) => void;
  error: (message: string, error?: unknown) => void;
}

const isDevelopment = process.env.NODE_ENV === 'development';

export const solicitudesLogger: SolicitudesLogger = {
  info: (message: string, details?: unknown) => {
    if (isDevelopment) {
      console.info(`[SolicitudesActionService] ${message}`, details);
    }
  },
  warn: (message: string, details?: unknown) => console.warn(`[SolicitudesActionService] ${message}`, details),
  error: (message: string, error?: unknown) => console.error(`[SolicitudesActionService] ${message}`, error),
};
