/**
 * @fileoverview Fachada de acciones de negocio para aprobación y gestión de solicitudes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ServiceResult,
  Solicitud,
  SolicitudActionResponse,
} from '../types';
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

export const createSolicitudesActionService = (supabaseClient: SupabaseClient) => {
  const dataService = createSolicitudesDataService(supabaseClient);
  const logger = solicitudesLogger;
  const deps = {
    supabaseClient,
    inventoryService: createSolicitudesInventoryService(supabaseClient, logger),
    movementService: createSolicitudesMovementService(supabaseClient, logger),
    notificationService: createSolicitudesNotificationService(logger),
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
    cantidadAprobada?: number
  ): Promise<ServiceResult<SolicitudActionResponse>> => {
    try {
      logger.info(`Actualizando estado de solicitud ${solicitud.id} a ${nuevoEstado}`);

      if (nuevoEstado === 'aprobada' && solicitud.estado === 'pendiente') {
        return approveSolicitud({
          solicitud,
          comentarioAdmin,
          operadorId,
          depositoId,
          cantidadAprobada,
        }, deps);
      }

      if (nuevoEstado === 'rechazada') {
        return rejectSolicitud({
          solicitud,
          comentarioAdmin,
          motivoRechazo,
          operadorId,
        }, deps);
      }

      if (nuevoEstado === 'entregada') {
        return deliverSolicitud({
          solicitud,
          comentarioAdmin,
          codigoComprobanteVerificado,
        }, deps);
      }

      return {
        success: false,
        error: `No se puede cambiar la solicitud al estado ${nuevoEstado}`,
      };
    } catch (err) {
      logger.error('Excepción al actualizar estado de solicitud', err);
      return {
        success: false,
        error: 'Error inesperado al actualizar la solicitud',
        errorDetails: err,
      };
    }
  };

  const revertirSolicitud = async (solicitudId: string): Promise<ServiceResult<SolicitudActionResponse>> => {
    try {
      return revertSolicitud({ solicitudId }, deps);
    } catch (err) {
      logger.error('Excepción al revertir solicitud', err);
      return {
        success: false,
        error: 'Error inesperado al revertir la solicitud',
        errorDetails: err,
      };
    }
  };

  const procesarDonacion = async (
    solicitud: Solicitud,
    cantidadDonar: number,
    porcentaje: number,
    comentario?: string,
    operadorId?: string,
    depositoId?: string
  ): Promise<ServiceResult<SolicitudActionResponse>> => {
    try {
      logger.info(`Procesando donación para solicitud ${solicitud.id}`, { cantidadDonar, porcentaje });
      return processPartialDelivery({
        solicitud,
        cantidadDonar,
        porcentaje,
        comentario,
        operadorId,
        depositoId,
      }, deps);
    } catch (err) {
      logger.error('Excepción al procesar donación', err);
      return {
        success: false,
        error: 'Error inesperado al procesar la donación',
        errorDetails: err,
      };
    }
  };

  return {
    ...dataService,
    updateSolicitudEstado,
    revertirSolicitud,
    procesarDonacion,
  };
};
