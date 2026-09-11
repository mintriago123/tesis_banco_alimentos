/**
 * @fileoverview Fachada de acciones de negocio para aprobación y gestión de solicitudes.
 * Ahora se ejecuta server-side dentro de un Server Action (ver actions.ts),
 * envuelta en `withRlsContext` — antes corría en el navegador contra el
 * cliente Supabase, confiando en RLS como única barrera; RLS sigue siendo la
 * barrera de fondo, pero ahora hay un `requireRole` explícito antes de llegar aquí.
 */
import type { Tx } from '@/db/client';
import type { ActiveUserProfile } from '@/lib/server-auth';
import type { ServiceResult, Solicitud, SolicitudActionResponse } from '../types';
import { createSolicitudesDataService } from './solicitudesDataService';
import { createSolicitudesInventoryService } from './solicitudesInventoryService';
import { solicitudesLogger } from './solicitudesLogger';
import { createSolicitudesMovementService } from './solicitudesMovementService';
import { createSolicitudesNotificationService } from './solicitudesNotificationService';
import { approveSolicitud } from './use-cases/approveSolicitud';
import { deliverSolicitud } from './use-cases/deliverSolicitud';
import { processPartialDelivery } from './use-cases/processPartialDelivery';
import { rejectSolicitud } from './use-cases/rejectSolicitud';
import { revertSolicitud } from './use-cases/revertSolicitud';
import { parseFiniteNumberValue, parseOptionalTextValue, parseUuidValue } from '@/lib/validation-core';

const MAX_COMENTARIO_LENGTH = 500;

export const createSolicitudesActionService = (db: Tx, actor: ActiveUserProfile) => {
  const dataService = createSolicitudesDataService(db);
  const logger = solicitudesLogger;
  const deps = {
    db,
    inventoryService: createSolicitudesInventoryService(db, logger),
    movementService: createSolicitudesMovementService(db, actor.id, logger),
    notificationService: createSolicitudesNotificationService(actor, logger),
    logger,
  };

  const updateSolicitudEstado = async (
    solicitud: Solicitud,
    nuevoEstado: 'aprobada' | 'rechazada' | 'entregada',
    comentarioAdmin?: string,
    motivoRechazo?: string,
    operadorId?: string,
    codigoComprobanteVerificado?: string,
    depositoId?: string,
    cantidadAprobada?: number,
  ): Promise<ServiceResult<SolicitudActionResponse>> => {
    try {
      logger.info(`Actualizando estado de solicitud ${solicitud.id} a ${nuevoEstado}`);

      const solicitudValidation = validateSolicitudForMutation(solicitud);
      if (!solicitudValidation.success) {
        return { success: false, error: solicitudValidation.error, errorDetails: solicitudValidation.errorDetails };
      }

      const comentario = parseOptionalTextValue(comentarioAdmin, { name: 'comentarioAdmin', maxLength: MAX_COMENTARIO_LENGTH });
      if (!comentario.success) {
        return { success: false, error: comentario.error };
      }

      const motivo = parseOptionalTextValue(motivoRechazo, { name: 'motivoRechazo', maxLength: MAX_COMENTARIO_LENGTH });
      if (!motivo.success) {
        return { success: false, error: motivo.error };
      }

      const operador = parseOptionalUuid(operadorId, 'operadorId');
      if (!operador.success) {
        return { success: false, error: operador.error };
      }

      const deposito = parseOptionalUuid(depositoId, 'depositoId');
      if (!deposito.success) {
        return { success: false, error: deposito.error };
      }

      const cantidad = parseOptionalCantidad(cantidadAprobada, solicitud.cantidad, 'cantidadAprobada');
      if (!cantidad.success) {
        return { success: false, error: cantidad.error };
      }

      if (nuevoEstado === 'aprobada' && solicitud.estado === 'pendiente') {
        if (!deposito.value) {
          return { success: false, error: 'Debes seleccionar una bodega para aprobar la solicitud' };
        }

        return approveSolicitud(
          { solicitud, comentarioAdmin: comentario.value ?? undefined, operadorId: operador.value, depositoId: deposito.value, cantidadAprobada: cantidad.value },
          deps,
        );
      }

      if (nuevoEstado === 'rechazada') {
        return rejectSolicitud({ solicitud, comentarioAdmin: comentario.value ?? undefined, motivoRechazo: motivo.value ?? undefined, operadorId: operador.value }, deps);
      }

      if (nuevoEstado === 'entregada') {
        return deliverSolicitud({ solicitud, comentarioAdmin: comentario.value ?? undefined, codigoComprobanteVerificado }, deps);
      }

      return { success: false, error: `No se puede cambiar la solicitud al estado ${nuevoEstado}` };
    } catch (err) {
      logger.error('Excepción al actualizar estado de solicitud', err);
      return { success: false, error: 'Error inesperado al actualizar la solicitud', errorDetails: err };
    }
  };

  const revertirSolicitud = async (solicitudId: string): Promise<ServiceResult<SolicitudActionResponse>> => {
    try {
      const parsedSolicitudId = parseUuidValue(solicitudId, { name: 'solicitudId' });
      if (!parsedSolicitudId.success) {
        return { success: false, error: parsedSolicitudId.error };
      }

      return revertSolicitud({ solicitudId: parsedSolicitudId.value }, deps);
    } catch (err) {
      logger.error('Excepción al revertir solicitud', err);
      return { success: false, error: 'Error inesperado al revertir la solicitud', errorDetails: err };
    }
  };

  const procesarDonacion = async (
    solicitud: Solicitud,
    cantidadDonar: number,
    porcentaje: number,
    comentario?: string,
    operadorId?: string,
    depositoId?: string,
  ): Promise<ServiceResult<SolicitudActionResponse>> => {
    try {
      logger.info(`Procesando donación para solicitud ${solicitud.id}`, { cantidadDonar, porcentaje });

      const solicitudValidation = validateSolicitudForMutation(solicitud);
      if (!solicitudValidation.success) {
        return { success: false, error: solicitudValidation.error, errorDetails: solicitudValidation.errorDetails };
      }

      const cantidad = parseOptionalCantidad(cantidadDonar, solicitud.cantidad, 'cantidadDonar');
      if (!cantidad.success || cantidad.value === undefined) {
        return { success: false, error: cantidad.success ? 'cantidadDonar es requerido.' : cantidad.error };
      }

      const porcentajeResult = parseFiniteNumberValue(porcentaje, { name: 'porcentaje', min: 0, max: 100 });
      if (!porcentajeResult.success) {
        return { success: false, error: porcentajeResult.error };
      }

      const comentarioResult = parseOptionalTextValue(comentario, { name: 'comentario', maxLength: MAX_COMENTARIO_LENGTH });
      if (!comentarioResult.success) {
        return { success: false, error: comentarioResult.error };
      }

      const operador = parseOptionalUuid(operadorId, 'operadorId');
      if (!operador.success) {
        return { success: false, error: operador.error };
      }

      const deposito = parseOptionalUuid(depositoId, 'depositoId');
      if (!deposito.success || !deposito.value) {
        return { success: false, error: deposito.success ? 'depositoId es requerido.' : deposito.error };
      }

      return processPartialDelivery(
        { solicitud, cantidadDonar: cantidad.value, porcentaje: porcentajeResult.value, comentario: comentarioResult.value ?? undefined, operadorId: operador.value, depositoId: deposito.value },
        deps,
      );
    } catch (err) {
      logger.error('Excepción al procesar donación', err);
      return { success: false, error: 'Error inesperado al procesar la donación', errorDetails: err };
    }
  };

  return { ...dataService, updateSolicitudEstado, revertirSolicitud, procesarDonacion };
};

type OptionalUuidResult = { success: true; value?: string } | { success: false; error: string };
type OptionalCantidadResult = { success: true; value?: number } | { success: false; error: string };

function validateSolicitudForMutation(solicitud: Solicitud): ServiceResult<void> {
  const solicitudId = parseUuidValue(solicitud.id, { name: 'solicitud.id' });
  if (!solicitudId.success) {
    return { success: false, error: solicitudId.error };
  }

  const usuarioId = parseUuidValue(solicitud.usuario_id, { name: 'solicitud.usuario_id' });
  if (!usuarioId.success) {
    return { success: false, error: usuarioId.error };
  }

  const cantidad = parseFiniteNumberValue(solicitud.cantidad, { name: 'solicitud.cantidad', min: 0 });
  if (!cantidad.success || cantidad.value <= 0) {
    return { success: false, error: cantidad.success ? 'solicitud.cantidad debe ser mayor a 0.' : cantidad.error };
  }

  if (!solicitud.tipo_alimento.trim()) {
    return { success: false, error: 'solicitud.tipo_alimento es requerido.' };
  }

  return { success: true };
}

function parseOptionalUuid(value: string | undefined, name: string): OptionalUuidResult {
  if (value === undefined || value === null || value === '') {
    return { success: true, value: undefined };
  }

  const parsed = parseUuidValue(value, { name });
  return parsed.success ? { success: true, value: parsed.value } : { success: false, error: parsed.error };
}

function parseOptionalCantidad(value: number | undefined, max: number, name: string): OptionalCantidadResult {
  if (value === undefined || value === null) {
    return { success: true, value: undefined };
  }

  const parsed = parseFiniteNumberValue(value, { name, min: 0, max });
  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }

  if (parsed.value <= 0) {
    return { success: false, error: `${name} debe ser mayor a 0.` };
  }

  return { success: true, value: parsed.value };
}
