import type { Solicitud } from '../../types';
import { updateSolicitudById } from './solicitudStatePersistence';
import type { SolicitudActionResult, SolicitudUseCaseDeps } from './types';
import { parseOptionalTextValue, parseUuidValue } from '@/lib/validation-core';

export interface DeliverSolicitudParams {
  solicitud: Solicitud;
  comentarioAdmin?: string;
  codigoComprobanteVerificado?: string;
}

export const deliverSolicitud = async (
  params: DeliverSolicitudParams,
  deps: SolicitudUseCaseDeps
): SolicitudActionResult => {
  const { solicitud, comentarioAdmin, codigoComprobanteVerificado } = params;
  const solicitudId = parseUuidValue(solicitud.id, { name: 'solicitud.id' });
  if (!solicitudId.success) {
    return { success: false, error: solicitudId.error };
  }

  const comentario = parseOptionalTextValue(comentarioAdmin, {
    name: 'comentarioAdmin',
    maxLength: 500,
  });
  if (!comentario.success) {
    return { success: false, error: comentario.error };
  }

  const codigoEsperado = solicitud.codigo_comprobante?.trim().toUpperCase();
  const codigoIngresado = codigoComprobanteVerificado?.trim().toUpperCase();

  if (!codigoEsperado) {
    return {
      success: false,
      error: 'La solicitud no tiene un comprobante aprobado asociado',
    };
  }

  if (!codigoIngresado) {
    return {
      success: false,
      error: 'Debes escanear o ingresar el código del comprobante para marcar la entrega',
    };
  }

  if (codigoIngresado !== codigoEsperado) {
    return {
      success: false,
      error: 'El código del comprobante no coincide con la solicitud',
    };
  }

  if (solicitud.estado !== 'aprobada') {
    return {
      success: false,
      error: 'Solo se pueden marcar como entregadas las solicitudes aprobadas',
    };
  }

  const updateData = {
    estado: 'entregada',
    fecha_respuesta: new Date().toISOString(),
    comentario_admin: comentario.value,
  };

  const { error: updateError } = await updateSolicitudById(deps.supabaseClient, solicitudId.value, updateData);

  if (updateError) {
    deps.logger.error('Error actualizando estado de solicitud', updateError);
    return {
      success: false,
      error: 'No fue posible actualizar el estado de la solicitud',
      errorDetails: updateError,
    };
  }

  await deps.notificationService.notificarCambioEstado(solicitud, 'entregada', {
    comentarioAdmin,
  });

  return {
    success: true,
    data: {
      success: true,
      message: 'Solicitud marcada como entregada exitosamente',
      warning: false,
    },
  };
};
