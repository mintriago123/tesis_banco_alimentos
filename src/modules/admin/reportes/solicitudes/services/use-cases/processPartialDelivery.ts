import { generarCodigoComprobante } from '@/lib/comprobante';
import type { Solicitud } from '../../types';
import {
  rollbackSolicitudState,
  snapshotSolicitudState,
  updateSolicitudById,
} from './solicitudStatePersistence';
import type { SolicitudActionResult, SolicitudUseCaseDeps } from './types';
import { buildInventoryDiscountError } from '../solicitudesResultMessages';
import {
  parseFiniteNumberValue,
  parseOptionalTextValue,
  parseUuidValue,
} from '@/lib/validation-core';

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

  let operadorIdValidado: string | undefined;
  if (operadorId) {
    const parsedOperadorId = parseUuidValue(operadorId, { name: 'operadorId' });
    if (!parsedOperadorId.success) {
      return { success: false, error: parsedOperadorId.error };
    }
    operadorIdValidado = parsedOperadorId.value;
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

  const cantidadDonarResult = parseFiniteNumberValue(cantidadDonar, {
    name: 'cantidadDonar',
    min: 0,
    max: cantidadSolicitud.value,
  });
  if (!cantidadDonarResult.success || cantidadDonarResult.value <= 0) {
    return {
      success: false,
      error: cantidadDonarResult.success ? 'cantidadDonar debe ser mayor a 0.' : cantidadDonarResult.error,
    };
  }

  const porcentajeResult = parseFiniteNumberValue(porcentaje, {
    name: 'porcentaje',
    min: 0,
    max: 100,
  });
  if (!porcentajeResult.success) {
    return { success: false, error: porcentajeResult.error };
  }

  const comentarioResult = parseOptionalTextValue(comentario, {
    name: 'comentario',
    maxLength: 500,
  });
  if (!comentarioResult.success) {
    return { success: false, error: comentarioResult.error };
  }

  const cantidadDonarValidada = cantidadDonarResult.value;
  const porcentajeValidado = porcentajeResult.value;
  const depositoValidado = parsedDepositoId.value;

  const validacionStock = await deps.inventoryService.validarStockDisponiblePorDeposito(
    solicitud,
    depositoValidado,
    cantidadDonarValidada
  );

  if (validacionStock.disponible === 0) {
    return {
      success: false,
      error: `La bodega seleccionada no tiene stock disponible para "${solicitud.tipo_alimento}".`,
    };
  }

  if (cantidadDonarValidada <= 0 || cantidadDonarValidada > solicitud.cantidad) {
    return {
      success: false,
      error: `La cantidad a donar debe ser mayor a 0 y máximo ${solicitud.cantidad} ${solicitud.unidades?.simbolo ?? 'unidades'}`,
    };
  }

  if (validacionStock.disponible < cantidadDonarValidada) {
    return {
      success: false,
      error: `Stock insuficiente para donar ${cantidadDonarValidada} unidades. Disponible: ${validacionStock.disponible} ${solicitud.unidades?.simbolo ?? 'unidades'}`,
    };
  }

  const previousState = snapshotSolicitudState(solicitud);
  const codigoComprobante = generarCodigoComprobante('solicitud', solicitudId.value);
  const cantidadAnterior = solicitud.cantidad_entregada || 0;
  const nuevaCantidadTotal = cantidadAnterior + cantidadDonarValidada;
  const esEntregaCompleta = nuevaCantidadTotal >= solicitud.cantidad;
  const solicitudTemporal = { ...solicitud, cantidad: cantidadDonarValidada };
  const resultadoInventario = await deps.inventoryService.descontarDelInventario(solicitudTemporal, depositoValidado);

  if (resultadoInventario.error || resultadoInventario.noStock || resultadoInventario.cantidadRestante > 0) {
    if (resultadoInventario.detalleEntregado.length > 0) {
      await deps.inventoryService.restaurarInventario(resultadoInventario.detalleEntregado);
    }

    return {
      success: false,
      error: buildInventoryDiscountError(
        resultadoInventario.errorDetails,
        'No fue posible descontar el inventario requerido para registrar la entrega',
      ),
      errorDetails: resultadoInventario.errorDetails ?? resultadoInventario,
    };
  }

  const updateData: Record<string, unknown> = {
    estado: 'aprobada',
    cantidad_entregada: nuevaCantidadTotal,
    tiene_entregas_parciales: !esEntregaCompleta || cantidadAnterior > 0,
    codigo_comprobante: codigoComprobante,
    comentario_admin: comentarioResult.value,
    fecha_respuesta: new Date().toISOString(),
    operador_aprobacion_id: operadorIdValidado || null,
    fecha_aprobacion: new Date().toISOString(),
  };

  const { error: updateError } = await updateSolicitudById(deps.supabaseClient, solicitudId.value, updateData);

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
      solicitud_id: solicitudId.value,
      cantidad_entregada: cantidadDonarValidada,
      porcentaje_entregado: porcentajeValidado,
      cantidad_solicitada: solicitud.cantidad,
      operador_id: operadorIdValidado,
      comentario: comentarioResult.value,
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
    mensaje = `Entrega parcial registrada: ${cantidadDonarValidada} ${solicitud.unidades?.simbolo ?? 'unidades'} (${porcentajeValidado}% del total). Total entregado: ${nuevaCantidadTotal}/${solicitud.cantidad}`;
    await deps.notificationService.notificarCambioEstado(solicitud, 'aprobada', {
      mensajeInventario: mensaje,
      comentarioAdmin: comentario,
      codigoComprobanteGuardado: codigoComprobante,
      esParcial: true,
      cantidadParcial: cantidadDonarValidada,
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
