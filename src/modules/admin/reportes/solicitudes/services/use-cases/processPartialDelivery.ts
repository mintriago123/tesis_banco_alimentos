import { generarCodigoComprobante } from '@/lib/comprobante';
import type { Solicitud } from '../../types';
import {
  rollbackSolicitudState,
  snapshotSolicitudState,
  updateSolicitudById,
} from './solicitudStatePersistence';
import type { SolicitudActionResult, SolicitudUseCaseDeps } from './types';

export interface ProcessPartialDeliveryParams {
  solicitud: Solicitud;
  cantidadDonar: number;
  porcentaje: number;
  comentario?: string;
  operadorId?: string;
  depositoId?: string;
}

export const processPartialDelivery = async (
  params: ProcessPartialDeliveryParams,
  deps: SolicitudUseCaseDeps
): SolicitudActionResult => {
  const {
    solicitud,
    cantidadDonar,
    porcentaje,
    comentario,
    operadorId,
    depositoId,
  } = params;

  if (!depositoId) {
    return {
      success: false,
      error: 'Debes seleccionar una bodega para aprobar la solicitud',
    };
  }

  const validacionStock = await deps.inventoryService.validarStockDisponiblePorDeposito(
    solicitud,
    depositoId,
    cantidadDonar
  );

  if (validacionStock.disponible === 0) {
    return {
      success: false,
      error: `La bodega seleccionada no tiene stock disponible para "${solicitud.tipo_alimento}".`,
    };
  }

  if (cantidadDonar <= 0 || cantidadDonar > solicitud.cantidad) {
    return {
      success: false,
      error: `La cantidad a donar debe ser mayor a 0 y máximo ${solicitud.cantidad} ${solicitud.unidades?.simbolo ?? 'unidades'}`,
    };
  }

  if (validacionStock.disponible < cantidadDonar) {
    return {
      success: false,
      error: `Stock insuficiente para donar ${cantidadDonar} unidades. Disponible: ${validacionStock.disponible} ${solicitud.unidades?.simbolo ?? 'unidades'}`,
    };
  }

  const previousState = snapshotSolicitudState(solicitud);
  const codigoComprobante = generarCodigoComprobante('solicitud', solicitud.id);
  const cantidadAnterior = solicitud.cantidad_entregada || 0;
  const nuevaCantidadTotal = cantidadAnterior + cantidadDonar;
  const esEntregaCompleta = nuevaCantidadTotal >= solicitud.cantidad;
  const solicitudTemporal = { ...solicitud, cantidad: cantidadDonar };
  const resultadoInventario = await deps.inventoryService.descontarDelInventario(solicitudTemporal, depositoId);

  if (resultadoInventario.error || resultadoInventario.noStock || resultadoInventario.cantidadRestante > 0) {
    if (resultadoInventario.detalleEntregado.length > 0) {
      await deps.inventoryService.restaurarInventario(resultadoInventario.detalleEntregado);
    }

    return {
      success: false,
      error: 'No fue posible descontar el inventario requerido para registrar la entrega',
      errorDetails: resultadoInventario.errorDetails ?? resultadoInventario,
    };
  }

  const updateData: Record<string, unknown> = {
    estado: 'aprobada',
    cantidad_entregada: nuevaCantidadTotal,
    tiene_entregas_parciales: !esEntregaCompleta || cantidadAnterior > 0,
    codigo_comprobante: codigoComprobante,
    comentario_admin: comentario?.trim() || null,
    fecha_respuesta: new Date().toISOString(),
    operador_aprobacion_id: operadorId || null,
    fecha_aprobacion: new Date().toISOString(),
  };

  const { error: updateError } = await updateSolicitudById(deps.supabaseClient, solicitud.id, updateData);

  if (updateError) {
    await deps.inventoryService.restaurarInventario(resultadoInventario.detalleEntregado);
    deps.logger.error('Error actualizando solicitud con donación', updateError);
    return {
      success: false,
      error: 'No fue posible registrar la donación',
      errorDetails: updateError,
    };
  }

  const movimientoResult = await deps.movementService.registrarMovimientoSolicitud(
    solicitudTemporal,
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

  const { error: historialError } = await deps.supabaseClient
    .from('historial_donaciones')
    .insert({
      solicitud_id: solicitud.id,
      cantidad_entregada: cantidadDonar,
      porcentaje_entregado: porcentaje,
      cantidad_solicitada: solicitud.cantidad,
      operador_id: operadorId,
      comentario: comentario?.trim() || null,
    });

  if (historialError) {
    deps.logger.error('Error registrando historial de donación', historialError);
  }

  let mensaje = '';
  if (esEntregaCompleta) {
    mensaje = `Donación completada: ${nuevaCantidadTotal} ${solicitud.unidades?.simbolo ?? 'unidades'} de ${solicitud.tipo_alimento}`;
    await deps.notificationService.notificarCambioEstado(solicitud, 'aprobada', {
      mensajeInventario: mensaje,
      comentarioAdmin: comentario,
      codigoComprobanteGuardado: codigoComprobante,
      esParcial: false,
      cantidadParcial: nuevaCantidadTotal,
      cantidadTotal: solicitud.cantidad,
    });
  } else {
    mensaje = `Entrega parcial registrada: ${cantidadDonar} ${solicitud.unidades?.simbolo ?? 'unidades'} (${porcentaje}% del total). Total entregado: ${nuevaCantidadTotal}/${solicitud.cantidad}`;
    await deps.notificationService.notificarCambioEstado(solicitud, 'aprobada', {
      mensajeInventario: mensaje,
      comentarioAdmin: comentario,
      codigoComprobanteGuardado: codigoComprobante,
      esParcial: true,
      cantidadParcial: cantidadDonar,
      cantidadTotal: solicitud.cantidad,
    });
  }

  return {
    success: true,
    data: {
      success: true,
      message: mensaje,
      warning: resultadoInventario.error || resultadoInventario.noStock,
    },
  };
};
