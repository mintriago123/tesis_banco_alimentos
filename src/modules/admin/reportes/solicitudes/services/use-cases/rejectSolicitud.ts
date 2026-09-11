import type { Solicitud } from '../../types';
import { updateSolicitudById } from './solicitudStatePersistence';
import type { SolicitudActionResult, SolicitudUseCaseDeps } from './types';
import { parseOptionalTextValue, parseUuidValue } from '@/lib/validation-core';

export interface RejectSolicitudParams {
  solicitud: Solicitud;
  comentarioAdmin?: string;
  motivoRechazo?: string;
  operadorId?: string;
}

export const rejectSolicitud = async (params: RejectSolicitudParams, deps: SolicitudUseCaseDeps): SolicitudActionResult => {
  const { solicitud, comentarioAdmin, motivoRechazo, operadorId } = params;
  const solicitudId = parseUuidValue(solicitud.id, { name: 'solicitud.id' });
  if (!solicitudId.success) {
    return { success: false, error: solicitudId.error };
  }

  let operadorIdValidado: string | undefined;
  if (operadorId) {
    const parsedOperadorId = parseUuidValue(operadorId, { name: 'operadorId' });
    if (!parsedOperadorId.success) {
      return { success: false, error: parsedOperadorId.error };
    }
    operadorIdValidado = parsedOperadorId.value;
  }

  const comentario = parseOptionalTextValue(comentarioAdmin, { name: 'comentarioAdmin', maxLength: 500 });
  if (!comentario.success) {
    return { success: false, error: comentario.error };
  }

  const motivo = parseOptionalTextValue(motivoRechazo, { name: 'motivoRechazo', maxLength: 500 });
  if (!motivo.success) {
    return { success: false, error: motivo.error };
  }

  const updateData = {
    estado: 'rechazada',
    fecha_respuesta: new Date().toISOString(),
    comentario_admin: comentario.value,
    motivo_rechazo: motivo.value,
    operador_rechazo_id: operadorIdValidado || null,
    fecha_rechazo: new Date().toISOString(),
  };

  const { error: updateError } = await updateSolicitudById(deps.db, solicitudId.value, updateData);

  if (updateError) {
    deps.logger.error('Error actualizando estado de solicitud', updateError);
    return { success: false, error: 'No fue posible actualizar el estado de la solicitud', errorDetails: updateError };
  }

  await deps.notificationService.notificarCambioEstado(solicitud, 'rechazada', { comentarioAdmin, motivoRechazo });

  return {
    success: true,
    data: {
      success: true,
      message: 'Solicitud rechazada exitosamente. El solicitante ha sido notificado con la fecha, hora y motivo del rechazo.',
      warning: false,
    },
  };
};
