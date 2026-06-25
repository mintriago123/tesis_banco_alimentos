/**
 * @fileoverview Servicio de acciones para donaciones (transiciones de estado e integración con inventario).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Donation,
  DonationEstado,
  DonationInventoryIntegrationResult,
  ServiceResult,
  MotivoCancelacion
} from '../types';
import { SYSTEM_MESSAGES } from '../constants';
import { sendNotification } from '@/modules/shared/services/notificationClient';
import {
  generarCodigoComprobante,
  generarURLComprobante,
  generarQRBase64,
  generarDatosComprobante,
} from '@/lib/comprobante';
import {
  buildDonacionAprobadaEmailTemplate,
  buildDonacionCanceladaEmailTemplate,
} from '@/lib/email/templates/donacionEmail';
import { getBaseUrl } from '@/lib/getBaseUrl';

const logger = {
  info: (message: string, details?: unknown) => console.info(`[DonationActionService] ${message}`, details),
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

const NO_ROWS_CODE = 'PGRST116';

// Cache para prevenir procesamiento simultáneo de la misma donación
const processingCache = new Map<number, Promise<ServiceResult<{ message: string; warning?: boolean }>>>();

export const createDonationActionService = (supabaseClient: SupabaseClient) => {
  const isApprovedLikeState = (estado: string | null | undefined): boolean => {
    const normalized = String(estado ?? '').trim().toLowerCase();
    return normalized === 'aprobada' || normalized === 'entregada';
  };

  const getCurrentDonationEstado = async (donationId: number): Promise<string | null> => {
    const { data, error } = await supabaseClient
      .from('donaciones')
      .select('estado')
      .eq('id', donationId)
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
      let depositoPreferido: string | null = null;
      const preferredDeposit = await supabaseClient
        .from('donante_depositos')
        .select('id_deposito, es_principal, created_at')
        .eq('donante_id', donation.user_id)
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
        .eq('id_usuario', donation.user_id)
        .eq('unidad_id', donation.unidad_id)
        .ilike('nombre_producto', donation.tipo_producto)
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

      let cantidadPendiente = donation.cantidad;

      for (const productData of productsData) {
        if (cantidadPendiente <= 0) break;

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
        cantidadRevertida: donation.cantidad - cantidadPendiente
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
    const primary = await supabaseClient
      .from('donaciones')
      .update(updateData)
      .eq('id', donationId);

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
        .eq('id', donationId);

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
      const existing = await supabaseClient
        .from('donante_depositos')
        .select('id_deposito, es_principal, created_at')
        .eq('donante_id', donorId)
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
          nombre: `Depósito Donante ${donorId.slice(0, 8)}`,
          descripcion: `Depósito asignado automáticamente al donante ${donorId}`
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
          donante_id: donorId,
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
      const updateData: any = {
        estado: nuevoEstado,
        actualizado_en: new Date().toISOString(),
        ...(codigoComprobante && { codigo_comprobante: codigoComprobante })
      };

      // Si es cancelación, agregar datos de cancelación
      if (nuevoEstado === 'Cancelada' && cancelacionData) {
        updateData.motivo_cancelacion = cancelacionData.motivo;
        updateData.observaciones_cancelacion = cancelacionData.observaciones || null;
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

      await notificarCambioEstadoDonacion(donation, nuevoEstado, codigoComprobante, cancelacionData);

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
    nuevoEstado: DonationEstado,
    codigoComprobanteGuardado?: string | null,
    cancelacionData?: { motivo: MotivoCancelacion; observaciones?: string }
  ) => {
    try {
      const baseUrl = getBaseUrl();

      // Usar el código guardado en BD o generar uno nuevo
      const codigoComprobante = codigoComprobanteGuardado ?? generarCodigoComprobante('donacion', String(donation.id));

      // Datos del usuario/donante
      const datosUsuario = {
        id: donation.user_id,
        nombre: donation.nombre_donante,
        email: donation.email,
        telefono: donation.telefono,
        direccion: donation.direccion_donante_completa,
        documento: donation.cedula_donante ?? donation.ruc_donante,
      };

      // Datos del pedido/donación
      const datosPedido = {
        id: String(donation.id),
        tipo: 'donacion' as const,
        tipoAlimento: donation.tipo_producto,
        cantidad: donation.cantidad,
        unidad: donation.unidad_simbolo ?? 'unidades',
        estado: nuevoEstado,
        fechaCreacion: donation.creado_en,
        fechaAprobacion: new Date().toISOString(),
      };

      // Generar comprobante con el código correcto
      const comprobante = {
        ...generarDatosComprobante('donacion', datosUsuario, datosPedido),
        codigoComprobante, // Usar el código guardado en BD
      };

      // Generar QR
      const urlComprobante = generarURLComprobante(
        baseUrl,
        codigoComprobante,
        'donacion',
        donation.user_id,
        String(donation.id)
      );
      const qrImageBase64 = await generarQRBase64(urlComprobante);

      // Configurar notificación y email según el estado
      switch (nuevoEstado) {
        case 'Aprobada': {
          const emailTemplate = buildDonacionAprobadaEmailTemplate({
            comprobante,
            qrImageBase64,
            baseUrl,
          });

          await sendNotification({
            titulo: `✅ Donación Aprobada - ¡Gracias! - Código: ${comprobante.codigoComprobante}`,
            mensaje: `Estimado/a ${datosUsuario.nombre}, su donación de ${donation.cantidad} ${datosPedido.unidad} de ${donation.tipo_producto} ha sido aprobada e incorporada a nuestro inventario. ¡Gracias por su generosidad! Su aporte ayudará a familias que lo necesitan.`,
            categoria: 'donacion',
            tipo: 'success',
            destinatarioId: donation.user_id ?? undefined,
            urlAccion: '/donante/donaciones',
            metadatos: {
              donacionId: donation.id,
              nuevoEstado,
              codigoComprobante: comprobante.codigoComprobante,
            },
            email: {
              subject: emailTemplate.subject,
              html: emailTemplate.html,
              text: emailTemplate.text,
            },
          });
          break;
        }

        case 'Cancelada': {
          // Construir mensaje con motivo si está disponible
          const motivoTexto = cancelacionData?.motivo ? ` Motivo: ${cancelacionData.motivo.replace(/_/g, ' ')}` : '';
          const observacionesTexto = cancelacionData?.observaciones ? ` Detalles: ${cancelacionData.observaciones}` : '';
          
          const emailTemplate = buildDonacionCanceladaEmailTemplate({
            comprobante: {
              ...comprobante,
              pedido: {
                ...comprobante.pedido,
                comentarioAdmin: cancelacionData?.observaciones || undefined
              }
            },
            baseUrl,
          });

          await sendNotification({
            titulo: '❌ Donación Cancelada',
            mensaje: `Estimado/a ${datosUsuario.nombre}, le informamos que su donación de ${donation.tipo_producto} ha sido cancelada.${motivoTexto}${observacionesTexto} Si tiene alguna duda, no dude en contactarnos.`,
            categoria: 'donacion',
            tipo: 'warning',
            destinatarioId: donation.user_id ?? undefined,
            urlAccion: '/donante/nueva-donacion',
            metadatos: {
              donacionId: donation.id,
              nuevoEstado,
              motivoCancelacion: cancelacionData?.motivo,
              observacionesCancelacion: cancelacionData?.observaciones
            },
            email: {
              subject: emailTemplate.subject,
              html: emailTemplate.html,
              text: emailTemplate.text,
            },
          });
          break;
        }

        default: {
          // Estado Pendiente u otro
          const emailTemplate = buildDonacionAprobadaEmailTemplate({
            comprobante,
            qrImageBase64,
            baseUrl,
          });

          await sendNotification({
            titulo: `🎁 Donación Registrada - Código: ${comprobante.codigoComprobante}`,
            mensaje: `Estimado/a ${datosUsuario.nombre}, su donación de ${donation.cantidad} ${datosPedido.unidad} de ${donation.tipo_producto} ha sido registrada. Nuestro equipo la procesará pronto.`,
            categoria: 'donacion',
            tipo: 'info',
            destinatarioId: donation.user_id ?? undefined,
            urlAccion: '/donante/donaciones',
            metadatos: {
              donacionId: donation.id,
              nuevoEstado,
              codigoComprobante: comprobante.codigoComprobante,
            },
            email: {
              subject: emailTemplate.subject,
              html: emailTemplate.html,
              text: emailTemplate.text,
            },
          });
          break;
        }
      }
    } catch (error) {
      logger.error('Error enviando notificación de donación', error);
    }
  };

  /* =====================================================
   * FUNCIONES DESACTIVADAS - AHORA LAS MANEJA EL TRIGGER DE BD
   * =====================================================
   * El trigger "trigger_crear_producto" en la base de datos
   * se encarga automáticamente de:
   * 1. Crear/actualizar productos donados
   * 2. Actualizar el inventario
   * 3. Garantizar integridad transaccional
   * 
   * Estas funciones se mantienen comentadas por si se necesitan en el futuro
   * ===================================================== */

  /* DESACTIVADO - El trigger de BD maneja esto automáticamente  const integrateWithInventory = async (donation: Donation): Promise<DonationInventoryIntegrationResult> => {
    try {
      const startTime = Date.now();
      logger.info('🚀 Iniciando integración con inventario', { 
        donationId: donation.id, 
        tipoProducto: donation.tipo_producto,
        cantidad: donation.cantidad,
        timestamp: new Date().toISOString()
      });
      
      const productoId = await obtenerOCrearProducto(donation);
      logger.info('✅ Producto obtenido/creado', { productoId, elapsed: `${Date.now() - startTime}ms` });
      
      const depositoId = await obtenerOCrearDeposito();
      logger.info('✅ Depósito obtenido/creado', { depositoId, elapsed: `${Date.now() - startTime}ms` });
      
      await actualizarInventario(productoId, depositoId, donation);
      logger.info('✅ Inventario actualizado exitosamente', { 
        productoId, 
        depositoId, 
        cantidad: donation.cantidad,
        elapsed: `${Date.now() - startTime}ms`,
        completedAt: new Date().toISOString()
      });

      return { productoId, depositoId };
    } catch (error) {
      logger.error('Error integrando donación con inventario', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      logger.error('Detalle del error de integración:', { 
        errorMessage, 
        donationId: donation.id,
        tipoProducto: donation.tipo_producto,
        cantidad: donation.cantidad
      });
      return {
        error: SYSTEM_MESSAGES.integrationWarning,
        productoId: undefined,
        depositoId: undefined
      };
    }
  };

  const obtenerOCrearProducto = async (donation: Donation): Promise<number> => {
    try {
      // BÚSQUEDA MÁS ROBUSTA: Por nombre de producto y unidad_id (más confiable que símbolo)
      // Esto evita crear duplicados por diferencias en la categoría/descripción
      const { data: existingProduct, error: searchError } = await supabaseClient
        .from('productos_donados')
        .select('id_producto')
        .eq('nombre_producto', donation.tipo_producto)
        .eq('unidad_id', donation.unidad_id)
        .maybeSingle();

      if (searchError && searchError.code !== NO_ROWS_CODE) {
        logger.error('Error buscando producto existente', searchError);
        throw new Error(`Error al buscar producto: ${searchError.message}`);
      }

      if (existingProduct) {
        logger.info('Producto existente encontrado', { 
          productoId: existingProduct.id_producto,
          nombreProducto: donation.tipo_producto 
        });
        return existingProduct.id_producto;
      }

      // Buscar alimento_id en el catálogo para vincular
      let alimentoId: number | null = null;
      try {
        const { data: alimentoData } = await supabaseClient
          .from('alimentos')
          .select('id')
          .ilike('nombre', donation.tipo_producto)
          .limit(1)
          .maybeSingle();
        
        if (alimentoData) {
          alimentoId = alimentoData.id;
          logger.info('Alimento encontrado en catálogo', { 
            alimentoId,
            nombreAlimento: donation.tipo_producto 
          });
        }
      } catch (err) {
        logger.warn('No se pudo vincular con catálogo de alimentos', err);
        // Continuar sin alimento_id
      }

      // Si no existe, crear nuevo producto
      const { data: newProduct, error: insertError } = await supabaseClient
        .from('productos_donados')
        .insert({
          nombre_producto: donation.tipo_producto,
          descripcion: donation.categoria_comida,
          unidad_medida: donation.unidad_simbolo,
          unidad_id: donation.unidad_id, // ✅ Guardar el ID de la unidad para conversiones
          fecha_caducidad: donation.fecha_vencimiento ?? null,
          fecha_donacion: new Date().toISOString(),
          id_usuario: donation.user_id,
          alimento_id: alimentoId // ✅ Vincular con catálogo de alimentos
        })
        .select('id_producto')
        .single();

      if (insertError || !newProduct) {
        logger.error('Error creando nuevo producto', insertError);
        throw new Error(`Error al crear producto: ${insertError?.message || 'Producto no retornado'}`);
      }

      logger.info('Nuevo producto creado', { 
        productoId: newProduct.id_producto,
        nombreProducto: donation.tipo_producto,
        alimentoId: alimentoId || 'sin vincular'
      });
      return newProduct.id_producto;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Error desconocido al obtener o crear producto');
    }
  };
  */

  /* DESACTIVADO - El trigger de BD maneja esto automáticamente
  const obtenerOCrearDeposito = async (): Promise<string> => {
    try {
      const { data: depositoPrincipal, error } = await supabaseClient
        .from('depositos')
        .select('id_deposito')
        .limit(1)
        .maybeSingle();

      if (!error && depositoPrincipal) {
        return depositoPrincipal.id_deposito;
      }

      if (error && error.code !== NO_ROWS_CODE) {
        logger.error('Error buscando depósito existente', error);
        throw new Error(`Error al buscar depósito: ${error.message}`);
      }

      const { data: newDeposito, error: insertError } = await supabaseClient
        .from('depositos')
        .insert({
          nombre: 'Depósito Principal',
          descripcion: 'Depósito principal para donaciones'
        })
        .select('id_deposito')
        .single();

      if (insertError || !newDeposito) {
        logger.error('Error creando nuevo depósito', insertError);
        throw new Error(`Error al crear depósito: ${insertError?.message || 'Depósito no retornado'}`);
      }

      return newDeposito.id_deposito;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Error desconocido al obtener o crear depósito');
    }
  };

  const actualizarInventario = async (productoId: number, depositoId: string, donation: Donation) => {
    try {
      logger.info('🔍 Buscando inventario existente', { 
        productoId, 
        depositoId,
        donacionId: donation.id,
        cantidad: donation.cantidad
      });
      
      const { data: existingInventory, error: inventoryError } = await supabaseClient
        .from('inventario')
        .select('id_inventario, cantidad_disponible')
        .eq('id_producto', productoId)
        .eq('id_deposito', depositoId)
        .maybeSingle();

      if (inventoryError && inventoryError.code !== NO_ROWS_CODE) {
        logger.error('Error buscando inventario existente', inventoryError);
        throw new Error(`Error al buscar inventario: ${inventoryError.message}`);
      }

      if (existingInventory) {
        const cantidadAnterior = existingInventory.cantidad_disponible ?? 0;
        const nuevaCantidad = cantidadAnterior + donation.cantidad;
        
        logger.info('📦 Actualizando inventario existente', {
          inventarioId: existingInventory.id_inventario,
          cantidadAnterior,
          cantidadAgregar: donation.cantidad,
          nuevaCantidad,
          producto: donation.tipo_producto
        });
        
        const { error: updateError } = await supabaseClient
          .from('inventario')
          .update({
            cantidad_disponible: nuevaCantidad,
            fecha_actualizacion: new Date().toISOString()
          })
          .eq('id_inventario', existingInventory.id_inventario);

        if (updateError) {
          logger.error('Error actualizando cantidad en inventario', updateError);
          throw new Error(`Error al actualizar inventario: ${updateError.message}`);
        }

        logger.info(SYSTEM_MESSAGES.inventoryIncrement(donation.cantidad, donation.unidad_simbolo, donation.tipo_producto));
        return;
      }
      
      logger.info('➕ Creando nuevo registro de inventario', { 
        productoId, 
        depositoId,
        cantidad: donation.cantidad,
        producto: donation.tipo_producto
      });

      const { error: insertError } = await supabaseClient
        .from('inventario')
        .insert({
          id_deposito: depositoId,
          id_producto: productoId,
          cantidad_disponible: donation.cantidad,
          fecha_actualizacion: new Date().toISOString()
        });

      if (insertError) {
        logger.error('Error creando registro de inventario', insertError);
        logger.error('Detalles del error de inserción:', {
          depositoId,
          productoId,
          cantidad: donation.cantidad,
          errorCode: insertError.code,
          errorMessage: insertError.message,
          errorDetails: insertError.details
        });
        throw new Error(`Error al crear registro de inventario: ${insertError.message}`);
      }

      logger.info(SYSTEM_MESSAGES.inventoryCreate(donation.cantidad, donation.unidad_simbolo, donation.tipo_producto));
      logger.info('✅ Registro de inventario creado exitosamente:', {
        depositoId,
        productoId,
        cantidad: donation.cantidad,
        producto: donation.tipo_producto
      });
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Error desconocido al actualizar inventario');
    }
  };
  */

  /* DESACTIVADO - El trigger de BD maneja esto automáticamente
  const registerDonationMovement = async (donation: Donation, productoId: number): Promise<ServiceResult<void>> => {
    try {
      const { data: authData, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !authData?.user) {
        return {
          success: false,
          error: 'No se pudo identificar al usuario que registra la donación',
          errorDetails: authError
        };
      }

      const { data: cabecera, error: cabeceraError } = await supabaseClient
        .from('movimiento_inventario_cabecera')
        .insert({
          fecha_movimiento: new Date().toISOString(),
          id_donante: donation.user_id,
          id_solicitante: authData.user.id,
          estado_movimiento: 'donado',
          observaciones: `Donación aprobada - ${donation.tipo_producto} (${donation.cantidad} ${donation.unidad_simbolo})`
        })
        .select('id_movimiento')
        .single();

      if (cabeceraError || !cabecera) {
        return {
          success: false,
          error: 'No fue posible registrar la cabecera del movimiento',
          errorDetails: cabeceraError
        };
      }

      const { error: detalleError } = await supabaseClient
        .from('movimiento_inventario_detalle')
        .insert({
          id_movimiento: cabecera.id_movimiento,
          id_producto: productoId,
          cantidad: donation.cantidad,
          tipo_transaccion: 'ingreso',
          rol_usuario: 'donante',
          observacion_detalle: `Ingreso por donación aprobada - ${donation.tipo_producto}`
        });

      if (detalleError) {
        return {
          success: false,
          error: 'No fue posible registrar el detalle del movimiento',
          errorDetails: detalleError
        };
      }

      return { success: true };
    } catch (error) {
      logger.error('Error registrando movimiento de donación', error);
      return {
        success: false,
        error: 'Error inesperado al registrar el movimiento',
        errorDetails: error
      };
    }
  };
  */

  return {
    updateDonationEstado
  };
};
