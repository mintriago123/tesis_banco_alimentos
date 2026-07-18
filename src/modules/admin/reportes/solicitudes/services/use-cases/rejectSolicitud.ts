import type { Solicitud } from '../../types';
import { updateSolicitudById } from './solicitudStatePersistence';
import type { SolicitudActionResult, SolicitudUseCaseDeps } from './types';

export interface RejectSolicitudParams {
  solicitud: Solicitud;
  comentarioAdmin?: string;
  motivoRechazo?: string;
  operadorId?: string;
}

export const rejectSolicitud = async (
  params: RejectSolicitudParams,
  deps: SolicitudUseCaseDeps
): SolicitudActionResult => {
  const { solicitud, comentarioAdmin, motivoRechazo, operadorId } = params;
  const updateData = {
    estado: 'rechazada',
    fecha_respuesta: new Date().toISOString(),
    comentario_admin: comentarioAdmin?.trim() ? comentarioAdmin.trim() : null,
    motivo_rechazo: motivoRechazo || null,
    operador_rechazo_id: operadorId || null,
    fecha_rechazo: new Date().toISOString(),
  };

  const { error: updateError } = await updateSolicitudById(deps.supabaseClient, solicitud.id, updateData);

  if (updateError) {
    deps.logger.error('Error actualizando estado de solicitud', updateError);
    return {
      success: false,
      error: 'No fue posible actualizar el estado de la solicitud',
      errorDetails: updateError,
    };
  }

  await deps.notificationService.notificarCambioEstado(solicitud, 'rechazada', {
    comentarioAdmin,
    motivoRechazo,
  });

  return {
    success: true,
    data: {
      success: true,
      message: 'Solicitud rechazada exitosamente. El solicitante ha sido notificado con la fecha, hora y motivo del rechazo.',
      warning: false,
    },
  };
};
