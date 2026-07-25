import type { Solicitud } from '../types';
import { sendNotification } from '@/modules/shared/services/notificationClient';
import { solicitudesLogger, type SolicitudesLogger } from './solicitudesLogger';

export type SolicitudNotifiableEstado = 'aprobada' | 'rechazada' | 'entregada';

export interface SolicitudNotificationOptions {
  mensajeInventario?: string;
  comentarioAdmin?: string;
  motivoRechazo?: string | null;
  codigoComprobanteGuardado?: string | null;
  esParcial?: boolean;
  cantidadParcial?: number;
  cantidadTotal?: number;
}

export const createSolicitudesNotificationService = (
  logger: SolicitudesLogger = solicitudesLogger
) => {
  const notificarCambioEstado = async (
    solicitud: Solicitud,
    nuevoEstado: SolicitudNotifiableEstado,
    options: SolicitudNotificationOptions = {}
  ) => {
    try {
      logger.info('Solicitando notificacion segura de solicitud', {
        solicitudId: solicitud.id,
        nuevoEstado,
        tieneOpciones: Object.keys(options).length > 0,
      });

      await sendNotification({
        event: 'food_request_status_changed',
        entityId: solicitud.id,
      });
    } catch (error) {
      logger.error('Error enviando notificación de solicitud', error);
    }
  };

  return {
    notificarCambioEstado,
  };
};

export type SolicitudesNotificationService = ReturnType<typeof createSolicitudesNotificationService>;
