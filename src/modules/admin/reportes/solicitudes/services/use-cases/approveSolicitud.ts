import { generarCodigoComprobante } from '@/lib/comprobante';
import type { Solicitud } from '../../types';
import { buildResultadoMensaje } from '../solicitudesResultMessages';
import {
  rollbackSolicitudState,
  snapshotSolicitudState,
  updateSolicitudById,
} from './solicitudStatePersistence';
import type { SolicitudActionResult, SolicitudUseCaseDeps } from './types';

export interface ApproveSolicitudParams {
  solicitud: Solicitud;
  comentarioAdmin?: string;
  operadorId?: string;
  depositoId?: string;
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
  const cantidadObjetivo = Math.max(0.01, Math.min(cantidadAprobada ?? solicitud.cantidad, solicitud.cantidad));
  const solicitudConCantidad = {
    ...solicitud,
    cantidad: cantidadObjetivo,
  };

  const validacionStock = depositoId
    ? await deps.inventoryService.validarStockDisponiblePorDeposito(solicitud, depositoId, cantidadObjetivo)
    : await deps.inventoryService.validarStockDisponible(solicitudConCantidad);

  if (!validacionStock.suficiente) {
    deps.logger.warn(`Stock insuficiente para aprobar solicitud ${solicitud.id}`, validacionStock);
    return {
      success: false,
      error: `No hay suficiente inventario disponible. Solicitado: ${cantidadObjetivo} ${solicitud.unidades?.simbolo ?? 'unidades'}, Disponible: ${validacionStock.disponible} ${solicitud.unidades?.simbolo ?? 'unidades'}`,
      errorDetails: validacionStock,
    };
  }

  const previousState = snapshotSolicitudState(solicitud);
  const codigoComprobante = generarCodigoComprobante('solicitud', solicitud.id);
  const resultadoInventario = await deps.inventoryService.descontarDelInventario(solicitudConCantidad, depositoId);

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
    comentario_admin: comentarioAdmin?.trim() ? comentarioAdmin.trim() : null,
    operador_aprobacion_id: operadorId || null,
    fecha_aprobacion: new Date().toISOString(),
    codigo_comprobante: codigoComprobante,
  };

  const { error: updateError } = await updateSolicitudById(deps.supabaseClient, solicitud.id, updateData);

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
