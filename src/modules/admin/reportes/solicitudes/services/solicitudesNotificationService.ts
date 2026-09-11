import 'server-only';

import type { Solicitud } from '../types';
import { NotificationService } from '@/modules/shared/services/notificationService';
import { buildNotificationForEvent } from '@/modules/shared/services/notificationEventDispatcher';
import type { ActiveUserProfile } from '@/lib/server-auth';
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

/**
 * Server-side equivalent of the old client-side `sendNotification` fetch —
 * this now runs inside the same Server Action as the state change, so it
 * calls the dispatcher directly instead of round-tripping through
 * `POST /api/notificaciones`.
 */
export const createSolicitudesNotificationService = (
  actor: ActiveUserProfile,
  logger: SolicitudesLogger = solicitudesLogger,
) => {
  const notificarCambioEstado = async (
    solicitud: Solicitud,
    nuevoEstado: SolicitudNotifiableEstado,
    options: SolicitudNotificationOptions = {},
  ) => {
    try {
      logger.info('Solicitando notificacion segura de solicitud', {
        solicitudId: solicitud.id,
        nuevoEstado,
        tieneOpciones: Object.keys(options).length > 0,
      });

      const input = await buildNotificationForEvent(actor, {
        event: 'food_request_status_changed',
        entityId: solicitud.id,
      });
      await new NotificationService().createNotification(input);
    } catch (error) {
      logger.error('Error enviando notificación de solicitud', error);
    }
  };

  return { notificarCambioEstado };
};

export type SolicitudesNotificationService = ReturnType<typeof createSolicitudesNotificationService>;
