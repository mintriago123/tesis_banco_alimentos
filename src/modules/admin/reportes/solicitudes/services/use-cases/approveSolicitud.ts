import { generarCodigoComprobante } from '@/lib/comprobante';
import type { Solicitud } from '../../types';
import { buildResultadoMensaje } from '../solicitudesResultMessages';
import {
  rollbackSolicitudState,
  snapshotSolicitudState,
  updateSolicitudById,
} from './solicitudStatePersistence';
import type { SolicitudActionResult, SolicitudUseCaseDeps } from './types';
import {
  parseFiniteNumberValue,
  parseOptionalTextValue,
  parseUuidValue,
} from '@/lib/validation-core';

export interface ApproveSolicitudParams {
  solicitud: Solicitud;
  comentarioAdmin?: string;
  operadorId?: string;
  depositoId: string;
  cantidadAprobada?: number;
}

export const approveSolicitud = async (
  params: ApproveSolicitudParams,
  deps: SolicitudUseCaseDeps
): SolicitudActionResult => {
  const {
    solicitud,
    comentarioAdmin,
    operadorId,
    depositoId,
    cantidadAprobada,
  } = params;
  const solicitudId = parseUuidValue(solicitud.id, { name: 'solicitud.id' });
  if (!solicitudId.success) {
    return { success: false, error: solicitudId.error };
  }

  const usuarioId = parseUuidValue(solicitud.usuario_id, { name: 'solicitud.usuario_id' });
  if (!usuarioId.success) {
    return { success: false, error: usuarioId.error };
  }

  const parsedDepositoId = parseUuidValue(depositoId, { name: 'depositoId' });
  if (!parsedDepositoId.success) {
    return { success: false, error: parsedDepositoId.error };
  }
  const depositoIdValidado = parsedDepositoId.value;

  let operadorIdValidado: string | undefined;
  if (operadorId) {
    const parsedOperadorId = parseUuidValue(operadorId, { name: 'operadorId' });
    if (!parsedOperadorId.success) {
      return { success: false, error: parsedOperadorId.error };
    }
    operadorIdValidado = parsedOperadorId.value;
  }

  const comentario = parseOptionalTextValue(comentarioAdmin, {
    name: 'comentarioAdmin',
    maxLength: 500,
  });
  if (!comentario.success) {
    return { success: false, error: comentario.error };
  }

  const cantidadSolicitud = parseFiniteNumberValue(solicitud.cantidad, {
    name: 'solicitud.cantidad',
    min: 0,
  });
  if (!cantidadSolicitud.success || cantidadSolicitud.value <= 0) {
    return {
      success: false,
      error: cantidadSolicitud.success ? 'solicitud.cantidad debe ser mayor a 0.' : cantidadSolicitud.error,
    };
  }

  if (cantidadAprobada !== undefined) {
    const cantidadAprobadaResult = parseFiniteNumberValue(cantidadAprobada, {
      name: 'cantidadAprobada',
      min: 0,
      max: cantidadSolicitud.value,
    });
    if (!cantidadAprobadaResult.success || cantidadAprobadaResult.value <= 0) {
      return {
        success: false,
        error: cantidadAprobadaResult.success
          ? 'cantidadAprobada debe ser mayor a 0.'
          : cantidadAprobadaResult.error,
      };
    }
  }

  const cantidadObjetivo = Math.max(0.01, Math.min(cantidadAprobada ?? solicitud.cantidad, solicitud.cantidad));
  const solicitudConCantidad = {
    ...solicitud,
    cantidad: cantidadObjetivo,
  };

  const validacionStock = await deps.inventoryService.validarStockDisponiblePorDeposito(
    solicitud,
    depositoIdValidado,
    cantidadObjetivo
  );

  if (!validacionStock.suficiente) {
    deps.logger.warn(`Stock insuficiente para aprobar solicitud ${solicitud.id}`, validacionStock);
    return {
      success: false,
      error: `No hay suficiente inventario disponible. Solicitado: ${cantidadObjetivo} ${solicitud.unidades?.simbolo ?? 'unidades'}, Disponible: ${validacionStock.disponible} ${solicitud.unidades?.simbolo ?? 'unidades'}`,
      errorDetails: validacionStock,
    };
  }

  const previousState = snapshotSolicitudState(solicitud);
  const codigoComprobante = generarCodigoComprobante('solicitud', solicitudId.value);
  const resultadoInventario = await deps.inventoryService.descontarDelInventario(solicitudConCantidad, depositoIdValidado);

  if (resultadoInventario.error || resultadoInventario.noStock || resultadoInventario.cantidadRestante > 0) {
    if (resultadoInventario.detalleEntregado.length > 0) {
      await deps.inventoryService.restaurarInventario(resultadoInventario.detalleEntregado);
    }

    return {
      success: false,
      error: 'No fue posible descontar el inventario requerido para aprobar la solicitud',
      errorDetails: resultadoInventario.errorDetails ?? resultadoInventario,
    };
  }

  const updateData = {
    estado: 'aprobada',
    fecha_respuesta: new Date().toISOString(),
    comentario_admin: comentario.value,
    operador_aprobacion_id: operadorIdValidado || null,
    fecha_aprobacion: new Date().toISOString(),
    codigo_comprobante: codigoComprobante,
  };

  const { error: updateError } = await updateSolicitudById(deps.supabaseClient, solicitudId.value, updateData);

  if (updateError) {
    await deps.inventoryService.restaurarInventario(resultadoInventario.detalleEntregado);
    deps.logger.error('Error actualizando estado de solicitud', updateError);
    return {
      success: false,
      error: 'No fue posible actualizar el estado de la solicitud',
      errorDetails: updateError,
    };
  }

  const movimientoResult = await deps.movementService.registrarMovimientoSolicitud(
    solicitudConCantidad,
    resultadoInventario
  );

  if (!movimientoResult.success) {
    await deps.inventoryService.restaurarInventario(resultadoInventario.detalleEntregado);
    await rollbackSolicitudState(deps.supabaseClient, solicitud.id, previousState);
    return {
      success: false,
      error: movimientoResult.error ?? 'No fue posible registrar el movimiento de inventario',
      errorDetails: movimientoResult.errorDetails,
    };
  }

  const mensaje = buildResultadoMensaje(solicitudConCantidad, resultadoInventario);
  await deps.notificationService.notificarCambioEstado(solicitud, 'aprobada', {
    mensajeInventario: mensaje,
    comentarioAdmin,
    codigoComprobanteGuardado: codigoComprobante,
  });

  return {
    success: true,
    data: {
      success: true,
      message: mensaje,
      warning: resultadoInventario.error || resultadoInventario.noStock || resultadoInventario.cantidadRestante > 0,
    },
  };
};
