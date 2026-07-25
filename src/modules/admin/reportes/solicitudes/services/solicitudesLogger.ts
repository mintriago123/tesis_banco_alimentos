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
  error: (message: string, error?: unknown) => {
    const details = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error && typeof error === 'object'
        ? {
            code: Reflect.get(error, 'code'),
            message: Reflect.get(error, 'message'),
            details: Reflect.get(error, 'details'),
            hint: Reflect.get(error, 'hint'),
          }
        : error;
    console.error(`[SolicitudesActionService] ${message}`, details);
  },
};
