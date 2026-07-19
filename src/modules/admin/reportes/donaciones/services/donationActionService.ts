/**
 * @fileoverview Servicio de acciones para donaciones (transiciones de estado e integración con inventario).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Donation,
  DonationEstado,
  ServiceResult,
  MotivoCancelacion
} from '../types';
import { SYSTEM_MESSAGES } from '../constants';
import { sendNotification } from '@/modules/shared/services/notificationClient';
import { generarCodigoComprobante } from '@/lib/comprobante';
import {
  escapeLikePattern,
  isUuid,
  parseEnumValue,
  parseFiniteNumberValue,
  parseOptionalTextValue,
  parsePositiveIntegerValue,
  parseUuidValue,
} from '@/lib/validation-core';

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = {
  info: (message: string, details?: unknown) => {
    if (isDevelopment) {
      console.info(`[DonationActionService] ${message}`, details);
    }
  },
  warn: (message: string, details?: unknown) => console.warn(`[DonationActionService] ${message}`, details),
  error: (message: string, error?: unknown) => {
    console.error(`[DonationActionService] ${message}`, error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
      console.error('Message:', error.message);
    } else if (error && typeof error === 'object') {
      console.error('Error details:', JSON.stringify(error, null, 2));
    }
  }
};

// Cache para prevenir procesamiento simultáneo de la misma donación
const processingCache = new Map<number, Promise<ServiceResult<{ message: string; warning?: boolean }>>>();
const MOTIVOS_CANCELACION = [
  'error_donante',
  'no_disponible',
  'calidad_inadecuada',
  'logistica_imposible',
  'duplicado',
  'solicitud_donante',
  'otro',
] as const satisfies readonly MotivoCancelacion[];
const MAX_OBSERVACIONES_CANCELACION = 500;

export const createDonationActionService = (supabaseClient: SupabaseClient) => {
  const isApprovedLikeState = (estado: string | null | undefined): boolean => {
    const normalized = String(estado ?? '').trim().toLowerCase();
    return normalized === 'aprobada' || normalized === 'entregada';
  };

  const getCurrentDonationEstado = async (donationId: number): Promise<string | null> => {
    const parsedDonationId = parsePositiveIntegerValue(donationId, {
      name: 'donationId',
      min: 1,
      max: 2147483647,
    });
    if (!parsedDonationId.success) {
      logger.warn('ID de donación inválido al leer estado actual', { donationId });
      return null;
    }

    const { data, error } = await supabaseClient
      .from('donaciones')
      .select('estado')
      .eq('id', parsedDonationId.value)
      .maybeSingle();

    if (error) {
      logger.warn('No se pudo leer estado actual desde BD; se usará estado local', {
        donationId,
        error
      });
      return null;
    }

    return typeof data?.estado === 'string' ? data.estado : null;
  };

  const rollbackDonationFromInventory = async (donation: Donation): Promise<ServiceResult<void>> => {
    try {
      const donationValidation = validateDonationForMutation(donation);
      if (!donationValidation.success) {
        return donationValidation;
      }

      const donorId = parseUuidValue(donation.user_id, { name: 'donation.user_id' });
      const unidadId = parsePositiveIntegerValue(donation.unidad_id, {
        name: 'donation.unidad_id',
        min: 1,
      });
      const cantidad = parseFiniteNumberValue(donation.cantidad, {
        name: 'donation.cantidad',
        min: 0,
      });

      if (!donorId.success || !unidadId.success || !cantidad.success || cantidad.value <= 0) {
        return {
          success: false,
          error: !donorId.success
            ? donorId.error
            : !unidadId.success
              ? unidadId.error
              : cantidad.success
                ? 'donation.cantidad debe ser mayor a 0.'
                : cantidad.error,
        };
      }

      const productoBusqueda = donation.tipo_producto.trim();
      if (!productoBusqueda) {
        return {
          success: false,
          error: 'La donación no tiene un producto válido para revertir inventario',
        };
      }

      let depositoPreferido: string | null = null;
      const preferredDeposit = await supabaseClient
        .from('donante_depositos')
        .select('id_deposito, es_principal, created_at')
        .eq('donante_id', donorId.value)
        .eq('activo', true)
        .order('es_principal', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!preferredDeposit.error && preferredDeposit.data?.id_deposito) {
        depositoPreferido = preferredDeposit.data.id_deposito;
      }

      const { data: productsData, error: productError } = await supabaseClient
        .from('productos_donados')
        .select('id_producto, cantidad')
        .eq('id_usuario', donorId.value)
        .eq('unidad_id', unidadId.value)
        .ilike('nombre_producto', escapeLikePattern(productoBusqueda))
        .order('id_producto', { ascending: false })
        .limit(20);

      if (productError) {
        return {
          success: false,
          error: 'No fue posible ubicar el producto para revertir inventario',
          errorDetails: productError
        };
      }

      if (!productsData || productsData.length === 0) {
        logger.warn('No se encontró producto para rollback de donación', { donationId: donation.id });
        return { success: true };
      }

      let cantidadPendiente = cantidad.value;

      for (const productData of productsData) {
        if (cantidadPendiente <= 0) break;
        if (!isUuid(productData.id_producto)) {
          logger.warn('Producto con id inválido durante rollback de donación', {
            donationId: donation.id,
            productId: productData.id_producto,
          });
          continue;
        }

        const { data: invRows, error: invError } = await supabaseClient
          .from('inventario')
          .select('id_inventario, id_deposito, cantidad_disponible')
          .eq('id_producto', productData.id_producto)
          .gt('cantidad_disponible', 0)
          .order('fecha_actualizacion', { ascending: false })
          .limit(50);

        if (invError) {
          return {
            success: false,
            error: 'No fue posible ubicar inventario para rollback',
            errorDetails: invError
          };
        }

        const inventories = [...(invRows ?? [])].sort((a, b) => {
          if (!depositoPreferido) return 0;
          const aPreferred = a.id_deposito === depositoPreferido ? 1 : 0;
          const bPreferred = b.id_deposito === depositoPreferido ? 1 : 0;
          return bPreferred - aPreferred;
        });

        const totalInventarioProducto = inventories.reduce(
          (acc, row) => acc + Number(row.cantidad_disponible ?? 0),
          0
        );

        if (totalInventarioProducto <= 0) {
          continue;
        }

        const maxProducto = Number(productData.cantidad ?? 0);
        const cantidadARevertir = Math.min(cantidadPendiente, totalInventarioProducto, maxProducto);

        if (cantidadARevertir <= 0) {
          continue;
        }

        const nuevaCantidadProducto = Math.max(maxProducto - cantidadARevertir, 0);
        const { error: updateProductError } = await supabaseClient
          .from('productos_donados')
          .update({ cantidad: nuevaCantidadProducto })
          .eq('id_producto', productData.id_producto);

        if (updateProductError) {
          return {
            success: false,
            error: 'No fue posible revertir cantidad en productos donados',
            errorDetails: updateProductError
          };
        }

        let pendienteInventario = cantidadARevertir;
        for (const invRow of inventories) {
          if (pendienteInventario <= 0) break;
          if (!isUuid(invRow.id_inventario)) {
            logger.warn('Inventario con id inválido durante rollback de donación', {
              donationId: donation.id,
              idInventario: invRow.id_inventario,
            });
            continue;
          }

          const disponible = Number(invRow.cantidad_disponible ?? 0);
          const descuento = Math.min(disponible, pendienteInventario);
          const nuevaCantidadInventario = Math.max(disponible - descuento, 0);

          const { error: updateInvError } = await supabaseClient
            .from('inventario')
            .update({
              cantidad_disponible: nuevaCantidadInventario,
              fecha_actualizacion: new Date().toISOString()
            })
            .eq('id_inventario', invRow.id_inventario);

          if (updateInvError) {
            return {
              success: false,
              error: 'No fue posible revertir cantidad en inventario',
              errorDetails: updateInvError
            };
          }

          pendienteInventario -= descuento;
        }

        cantidadPendiente -= cantidadARevertir;
      }

      if (cantidadPendiente > 0) {
        logger.warn('Rollback parcial de inventario: no se encontró suficiente stock para revertir todo', {
          donationId: donation.id,
          cantidadOriginal: donation.cantidad,
          cantidadNoRevertida: cantidadPendiente
        });
      }

      logger.info('Rollback de inventario aplicado para donación', {
        donationId: donation.id,
        cantidadOriginal: donation.cantidad,
        cantidadRevertida: cantidad.value - cantidadPendiente
      });

      return { success: true };
    } catch (error) {
      logger.error('Error inesperado al revertir inventario de donación', error);
      return {
        success: false,
        error: 'Error inesperado al revertir inventario',
        errorDetails: error
      };
    }
  };

  const updateDonationEstadoInDatabase = async (donationId: number, updateData: Record<string, unknown>) => {
    const parsedDonationId = parsePositiveIntegerValue(donationId, {
      name: 'donationId',
      min: 1,
      max: 2147483647,
    });
    if (!parsedDonationId.success) {
      return {
        error: {
          message: parsedDonationId.error,
          code: 'VALIDATION_ERROR',
        },
        usedLegacyEstado: false,
      };
    }

    const primary = await supabaseClient
      .from('donaciones')
      .update(updateData)
      .eq('id', parsedDonationId.value);

    if (!primary.error) {
      return { error: null as null | typeof primary.error, usedLegacyEstado: false };
    }

    const estadoValue = String(updateData.estado ?? '');
    const isConstraintError = primary.error.code === '23514';

    if (isConstraintError && estadoValue === 'Aprobada') {
      const fallbackData = {
        ...updateData,
        estado: 'Entregada'
      };

      const legacy = await supabaseClient
        .from('donaciones')
        .update(fallbackData)
        .eq('id', parsedDonationId.value);

      if (!legacy.error) {
        logger.warn('BD con constraint legacy detectada. Se guardó estado Entregada como equivalente de Aprobada.', {
          donationId
        });
        return { error: null as null | typeof legacy.error, usedLegacyEstado: true };
      }

      return { error: legacy.error, usedLegacyEstado: false };
    }

    return { error: primary.error, usedLegacyEstado: false };
  };

  const ensureDonorDepositMapping = async (donorId: string): Promise<ServiceResult<{ depositoId: string }>> => {
    try {
      const parsedDonorId = parseUuidValue(donorId, { name: 'donorId' });
      if (!parsedDonorId.success) {
        return {
          success: false,
          error: parsedDonorId.error,
        };
      }

      const existing = await supabaseClient
        .from('donante_depositos')
        .select('id_deposito, es_principal, created_at')
        .eq('donante_id', parsedDonorId.value)
        .eq('activo', true)
        .order('es_principal', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing.error) {
        logger.error('Error consultando mapeo de bodega por donante', existing.error);
        return {
          success: false,
          error: 'No fue posible validar la bodega del donante',
          errorDetails: existing.error
        };
      }

      if (existing.data?.id_deposito) {
        return {
          success: true,
          data: { depositoId: existing.data.id_deposito }
        };
      }

      const newDeposito = await supabaseClient
        .from('depositos')
        .insert({
          nombre: `Depósito Donante ${parsedDonorId.value.slice(0, 8)}`,
          descripcion: `Depósito asignado automáticamente al donante ${parsedDonorId.value}`
        })
        .select('id_deposito')
        .single();

      if (newDeposito.error || !newDeposito.data) {
        logger.error('Error creando depósito para donante', newDeposito.error);
        return {
          success: false,
          error: 'No fue posible crear la bodega del donante',
          errorDetails: newDeposito.error
        };
      }

      const donorMapping = await supabaseClient
        .from('donante_depositos')
        .insert({
          donante_id: parsedDonorId.value,
          id_deposito: newDeposito.data.id_deposito,
          es_principal: true,
          activo: true
        })
        .select('id_deposito')
        .single();

      if (donorMapping.error || !donorMapping.data) {
        logger.error('Error creando mapeo donante-bodega', donorMapping.error);
        return {
          success: false,
          error: 'No fue posible vincular al donante con su bodega',
          errorDetails: donorMapping.error
        };
      }

      return {
        success: true,
        data: { depositoId: donorMapping.data.id_deposito }
      };
    } catch (error) {
      logger.error('Excepción asegurando mapeo de bodega por donante', error);
      return {
        success: false,
        error: 'Error inesperado asegurando la bodega del donante',
        errorDetails: error
      };
    }
  };

  const updateDonationEstado = async (
    donation: Donation,
    nuevoEstado: DonationEstado,
    cancelacionData?: { motivo: MotivoCancelacion; observaciones?: string }
  ): Promise<ServiceResult<{ message: string; warning?: boolean }>> => {
    const donationValidation = validateDonationForMutation(donation);
    if (!donationValidation.success) {
      return {
        success: false,
        error: donationValidation.error,
        errorDetails: donationValidation.errorDetails,
      };
    }

    const cancelacionValidation = validateCancelacionData(nuevoEstado, cancelacionData);
    if (!cancelacionValidation.success) {
      return {
        success: false,
        error: cancelacionValidation.error,
      };
    }
    const cancelacionPayload = cancelacionValidation.data;

    // Prevenir procesamiento duplicado de la misma donación
    const cacheKey = donation.id;
    
    if (processingCache.has(cacheKey)) {
      logger.warn('⚠️ Intento de procesamiento duplicado detectado y bloqueado', { 
        donacionId: donation.id, 
        estado: nuevoEstado 
      });
      return processingCache.get(cacheKey)!;
    }
    
    const processPromise = (async () => {
    try {
      // Validación: Si es cancelación, se requieren los datos de cancelación
      if (nuevoEstado === 'Cancelada' && !cancelacionData) {
        logger.error('Intento de cancelar donación sin datos de cancelación', { donacionId: donation.id });
        return {
          success: false,
          error: 'Se requiere motivo y observaciones para cancelar una donación'
        };
      }

      if (nuevoEstado === 'Aprobada') {
        const mappingResult = await ensureDonorDepositMapping(donation.user_id);
        if (!mappingResult.success) {
          return {
            success: false,
            error: mappingResult.error ?? 'No fue posible asegurar la bodega del donante',
            errorDetails: mappingResult.errorDetails
          };
        }
      }

      // Generar código de comprobante si no existe
      const codigoComprobante = donation.codigo_comprobante ?? generarCodigoComprobante('donacion', String(donation.id));
      
      // Obtener usuario actual para registrar quién cancela
      const { data: { user } } = await supabaseClient.auth.getUser();
      
      // Preparar datos de actualización
      const updateData: {
        estado: string;
        actualizado_en: string;
        codigo_comprobante?: string;
        motivo_cancelacion?: string;
        observaciones_cancelacion?: string | null;
        usuario_cancelacion_id?: string | null;
        fecha_cancelacion?: string;
      } = {
        estado: nuevoEstado,
        actualizado_en: new Date().toISOString(),
        ...(codigoComprobante && { codigo_comprobante: codigoComprobante })
      };

      // Si es cancelación, agregar datos de cancelación
      if (nuevoEstado === 'Cancelada' && cancelacionData) {
        if (!cancelacionPayload) {
          return {
            success: false,
            error: 'Se requiere motivo y observaciones para cancelar una donación'
          };
        }

        updateData.motivo_cancelacion = cancelacionPayload.motivo;
        updateData.observaciones_cancelacion = cancelacionPayload.observaciones;
        updateData.usuario_cancelacion_id = user?.id || null;
        updateData.fecha_cancelacion = new Date().toISOString();
      }
      
      const estadoActualEnBd = await getCurrentDonationEstado(donation.id);
      const previousEstado = estadoActualEnBd ?? String((donation as Donation & { estado?: string }).estado ?? '');
      const wasApprovedLike = isApprovedLikeState(previousEstado);
      const willBeApprovedLike = isApprovedLikeState(nuevoEstado);

      const { error, usedLegacyEstado } = await updateDonationEstadoInDatabase(donation.id, updateData);

      if (error) {
        logger.error('Error actualizando estado de donación', error);
        
        // Si el error es por columnas que no existen
        if (error.code === '42703' || error.message?.includes('column')) {
          return {
            success: false,
            error: 'La base de datos no está actualizada. Por favor, ejecuta el script: database/agregar-campos-cancelacion-donaciones.sql',
            errorDetails: error
          };
        }
        
        return {
          success: false,
          error: 'No fue posible actualizar el estado de la donación',
          errorDetails: error
        };
      }

      if (wasApprovedLike && !willBeApprovedLike) {
        const rollbackResult = await rollbackDonationFromInventory(donation);
        if (!rollbackResult.success) {
          return {
            success: false,
            error: rollbackResult.error ?? 'No fue posible revertir inventario de la donación',
            errorDetails: rollbackResult.errorDetails
          };
        }
      }

      // NOTA: El trigger de BD (trigger_crear_producto) se encarga automáticamente
      // de agregar la donación al inventario cuando el estado cambia a "Aprobada"
      // No necesitamos hacerlo manualmente aquí (esto previene duplicaciones)
      
      if (nuevoEstado === 'Aprobada') {
        logger.info('✅ Donación marcada como Aprobada - El trigger de BD actualizará el inventario automáticamente', { 
          donationId: donation.id, 
          estadoAnterior: donation.estado, 
          estadoNuevo: nuevoEstado 
        });
      }

      await notificarCambioEstadoDonacion(donation, nuevoEstado);

      return {
        success: true,
        data: {
          message: usedLegacyEstado
            ? `${SYSTEM_MESSAGES.stateUpdateSuccess(nuevoEstado)} (compatibilidad temporal con BD legacy activa)`
            : SYSTEM_MESSAGES.stateUpdateSuccess(nuevoEstado),
          warning: false
        }
      };
    } catch (error) {
      logger.error('Excepción al actualizar estado de donación', error);
      return {
        success: false,
        error: 'Error inesperado al actualizar la donación',
        errorDetails: error
      };
    } finally {
      // Limpiar cache después de 2 segundos para permitir reintentos
      setTimeout(() => processingCache.delete(cacheKey), 2000);
    }
    })();
    
    processingCache.set(cacheKey, processPromise);
    return processPromise;
  };

  const notificarCambioEstadoDonacion = async (
    donation: Donation, 
    nuevoEstado: DonationEstado
  ) => {
    try {
      logger.info('Solicitando notificacion segura de donacion', {
        donacionId: donation.id,
        nuevoEstado,
      });

      await sendNotification({
        event: 'donation_status_changed',
        entityId: String(donation.id),
      });
    } catch (error) {
      logger.error('Error enviando notificación de donación', error);
    }
  };

  // La integración de donaciones con inventario la gobierna el trigger de BD
  // `trigger_crear_producto`; ver docs/DATABASE.md para la frontera de responsabilidades.

  return {
    updateDonationEstado
  };
};

function validateDonationForMutation(donation: Donation): ServiceResult<void> {
  const donationId = parsePositiveIntegerValue(donation.id, {
    name: 'donation.id',
    min: 1,
    max: 2147483647,
  });
  if (!donationId.success) {
    return { success: false, error: donationId.error };
  }

  const userId = parseUuidValue(donation.user_id, { name: 'donation.user_id' });
  if (!userId.success) {
    return { success: false, error: userId.error };
  }

  const unidadId = parsePositiveIntegerValue(donation.unidad_id, {
    name: 'donation.unidad_id',
    min: 1,
  });
  if (!unidadId.success) {
    return { success: false, error: unidadId.error };
  }

  const cantidad = parseFiniteNumberValue(donation.cantidad, {
    name: 'donation.cantidad',
    min: 0,
  });
  if (!cantidad.success || cantidad.value <= 0) {
    return {
      success: false,
      error: cantidad.success ? 'donation.cantidad debe ser mayor a 0.' : cantidad.error,
    };
  }

  if (!donation.tipo_producto.trim()) {
    return { success: false, error: 'donation.tipo_producto es requerido.' };
  }

  return { success: true };
}

function validateCancelacionData(
  nuevoEstado: DonationEstado,
  cancelacionData?: { motivo: MotivoCancelacion; observaciones?: string }
): ServiceResult<{ motivo: MotivoCancelacion; observaciones: string | null }> {
  if (nuevoEstado !== 'Cancelada') {
    return { success: true, data: { motivo: 'otro', observaciones: null } };
  }

  if (!cancelacionData) {
    return {
      success: false,
      error: 'Se requiere motivo y observaciones para cancelar una donación',
    };
  }

  const motivo = parseEnumValue(cancelacionData.motivo, MOTIVOS_CANCELACION, { name: 'motivo' });
  if (!motivo.success) {
    return { success: false, error: motivo.error };
  }

  const observaciones = parseOptionalTextValue(cancelacionData.observaciones, {
    name: 'observaciones',
    maxLength: MAX_OBSERVACIONES_CANCELACION,
  });
  if (!observaciones.success) {
    return { success: false, error: observaciones.error };
  }

  if (motivo.value === 'otro' && !observaciones.value) {
    return {
      success: false,
      error: 'Las observaciones son obligatorias cuando el motivo es otro',
    };
  }

  return {
    success: true,
    data: {
      motivo: motivo.value,
      observaciones: observaciones.value,
    },
  };
}
