import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversionResolution } from '@/lib/unidadConversion';
import { resolverConversion } from '@/lib/unidadConversion';
import type {
  DescuentoProductoResult,
  InventarioDescontado,
  ProductoInventario,
  ResultadoInventario,
  ServiceResult,
  Solicitud,
} from '../types';
import { solicitudesLogger, type SolicitudesLogger } from './solicitudesLogger';
import {
  escapeLikePattern,
  isUuid,
  parseFiniteNumberValue,
  parsePositiveIntegerValue,
  parseUuidValue,
} from '@/lib/validation-core';

export const createSolicitudesInventoryService = (
  supabaseClient: SupabaseClient,
  logger: SolicitudesLogger = solicitudesLogger
) => {
  const buscarProductosCoincidentes = async (tipoAlimento: string): Promise<ProductoInventario[]> => {
    const termino = tipoAlimento.trim();
    if (!termino) {
      return [];
    }

    const { data, error } = await supabaseClient
      .from('productos_donados')
      .select('id_producto, nombre_producto, unidad_id')
      .ilike('nombre_producto', `%${escapeLikePattern(termino)}%`);

    if (error) {
      throw error;
    }

    return (data as ProductoInventario[] | null | undefined) ?? [];
  };

  const obtenerFactorConversion = async (
    unidadOrigenId: number,
    unidadDestinoId: number
  ): Promise<ConversionResolution> => {
    const origen = parsePositiveIntegerValue(unidadOrigenId, { name: 'unidadOrigenId', min: 1 });
    const destino = parsePositiveIntegerValue(unidadDestinoId, { name: 'unidadDestinoId', min: 1 });

    if (!origen.success || !destino.success) {
      logger.warn('IDs de unidad inválidos para conversión', { unidadOrigenId, unidadDestinoId });
      return { convertible: false, reason: 'no_conversion' };
    }

    return resolverConversion(supabaseClient, origen.value, destino.value);
  };

  const validarStockDisponible = async (
    solicitud: Solicitud
  ): Promise<{ suficiente: boolean; disponible: number; solicitado: number }> => {
    try {
      const cantidad = parseFiniteNumberValue(solicitud.cantidad, {
        name: 'solicitud.cantidad',
        min: 0,
      });

      if (!cantidad.success || cantidad.value <= 0) {
        logger.warn('Cantidad inválida para validar stock', { solicitudId: solicitud.id });
        return {
          suficiente: false,
          disponible: 0,
          solicitado: Number.isFinite(solicitud.cantidad) ? solicitud.cantidad : 0,
        };
      }

      if (!solicitud.unidad_id) {
        return {
          suficiente: false,
          disponible: 0,
          solicitado: cantidad.value,
        };
      }

      const productosCoincidentes = await buscarProductosCoincidentes(solicitud.tipo_alimento);

      if (!productosCoincidentes || productosCoincidentes.length === 0) {
        return {
          suficiente: false,
          disponible: 0,
          solicitado: cantidad.value,
        };
      }

      let totalDisponible = 0;

      for (const producto of productosCoincidentes) {
        const { data, error } = await supabaseClient
          .from('inventario')
          .select('cantidad_disponible')
          .eq('id_producto', producto.id_producto)
          .gt('cantidad_disponible', 0);

        if (error || !data) continue;

        const stockProducto = data.reduce((sum, item) => sum + (item.cantidad_disponible ?? 0), 0);

        if (!producto.unidad_id || !solicitud.unidad_id) {
          logger.warn('Stock omitido porque falta una unidad explícita', { producto, solicitudId: solicitud.id });
          continue;
        }

        const conversion = await obtenerFactorConversion(producto.unidad_id, solicitud.unidad_id);
        if (!conversion.convertible) {
          logger.info('Stock disponible en una unidad no convertible; no se suma', {
            producto: producto.nombre_producto,
            productoUnidadId: producto.unidad_id,
            solicitudUnidadId: solicitud.unidad_id,
            reason: conversion.reason,
          });
          continue;
        }

        totalDisponible += stockProducto * conversion.factor;
      }

      return {
        suficiente: totalDisponible >= cantidad.value,
        disponible: totalDisponible,
        solicitado: cantidad.value,
      };
    } catch (error) {
      logger.error('Error validando stock disponible', error);
      return {
        suficiente: false,
        disponible: 0,
        solicitado: solicitud.cantidad,
      };
    }
  };

  const validarStockDisponiblePorDeposito = async (
    solicitud: Solicitud,
    depositoId: string,
    cantidadObjetivo: number
  ): Promise<{ suficiente: boolean; disponible: number; solicitado: number }> => {
    try {
      const parsedDepositoId = parseUuidValue(depositoId, { name: 'depositoId' });
      const cantidad = parseFiniteNumberValue(cantidadObjetivo, {
        name: 'cantidadObjetivo',
        min: 0,
      });

      if (!parsedDepositoId.success || !cantidad.success || cantidad.value <= 0) {
        logger.warn('Parámetros inválidos para validar stock por depósito', {
          depositoId,
          cantidadObjetivo,
        });
        return {
          suficiente: false,
          disponible: 0,
          solicitado: Number.isFinite(cantidadObjetivo) ? cantidadObjetivo : 0,
        };
      }

      if (!solicitud.unidad_id) {
        return {
          suficiente: false,
          disponible: 0,
          solicitado: cantidad.value,
        };
      }

      const productosCoincidentes = await buscarProductosCoincidentes(solicitud.tipo_alimento);

      if (!productosCoincidentes || productosCoincidentes.length === 0) {
        return {
          suficiente: false,
          disponible: 0,
          solicitado: cantidad.value,
        };
      }

      let totalDisponible = 0;

      for (const producto of productosCoincidentes) {
        const { data, error } = await supabaseClient
          .from('inventario')
          .select('cantidad_disponible')
          .eq('id_producto', producto.id_producto)
          .eq('id_deposito', parsedDepositoId.value)
          .gt('cantidad_disponible', 0);

        if (error || !data) continue;

        const stockProducto = data.reduce((sum, item) => sum + (item.cantidad_disponible ?? 0), 0);

        if (!producto.unidad_id || !solicitud.unidad_id) {
          logger.warn('Stock omitido porque falta una unidad explícita', { producto, solicitudId: solicitud.id });
          continue;
        }

        const conversion = await obtenerFactorConversion(producto.unidad_id, solicitud.unidad_id);
        if (!conversion.convertible) {
          logger.info('Stock del depósito disponible en una unidad no convertible; no se suma', {
            producto: producto.nombre_producto,
            productoUnidadId: producto.unidad_id,
            solicitudUnidadId: solicitud.unidad_id,
            reason: conversion.reason,
          });
          continue;
        }

        totalDisponible += stockProducto * conversion.factor;
      }

      return {
        suficiente: totalDisponible >= cantidad.value,
        disponible: totalDisponible,
        solicitado: cantidad.value,
      };
    } catch (error) {
      logger.error('Error validando stock por depósito', error);
      return {
        suficiente: false,
        disponible: 0,
        solicitado: cantidadObjetivo,
      };
    }
  };

  const descontarDelInventario = async (solicitud: Solicitud, depositoId?: string): Promise<ResultadoInventario> => {
    try {
      const cantidad = parseFiniteNumberValue(solicitud.cantidad, {
        name: 'solicitud.cantidad',
        min: 0,
      });

      if (!cantidad.success || cantidad.value <= 0) {
        return {
          cantidadRestante: 0,
          productosActualizados: 0,
          error: true,
          errorDetails: cantidad.success ? 'solicitud.cantidad debe ser mayor a 0.' : cantidad.error,
          detalleEntregado: [],
        };
      }

      if (depositoId) {
        const parsedDepositoId = parseUuidValue(depositoId, { name: 'depositoId' });
        if (!parsedDepositoId.success) {
          return {
            cantidadRestante: solicitud.cantidad,
            productosActualizados: 0,
            error: true,
            errorDetails: parsedDepositoId.error,
            detalleEntregado: [],
          };
        }
      }

      const productosCoincidentes = await buscarProductosCoincidentes(solicitud.tipo_alimento);

      if (!productosCoincidentes || productosCoincidentes.length === 0) {
        logger.warn(`No se encontraron productos coincidentes para ${solicitud.tipo_alimento}`);
        return {
          cantidadRestante: solicitud.cantidad,
          productosActualizados: 0,
          noStock: true,
          detalleEntregado: [],
        };
      }

      return procesarDescuentoInventario(productosCoincidentes, solicitud, depositoId);
    } catch (error) {
      logger.error('Error descontando inventario', error);
      return {
        cantidadRestante: solicitud.cantidad,
        productosActualizados: 0,
        error: true,
        errorDetails: error,
        detalleEntregado: [],
      };
    }
  };

  const restaurarInventario = async (
    movimientos: InventarioDescontado[]
  ): Promise<ServiceResult<{ productosActualizados: number }>> => {
    try {
      let productosActualizados = 0;

      for (const movimiento of movimientos) {
        if (!isUuid(movimiento.producto.id_producto)) {
          logger.warn('Movimiento con id_producto inválido; se omite restauración', movimiento.producto);
          continue;
        }

        const cantidadEntregada = parseFiniteNumberValue(movimiento.cantidadEntregada, {
          name: 'cantidadEntregada',
          min: 0,
        });
        if (!cantidadEntregada.success || cantidadEntregada.value <= 0) {
          logger.warn('Movimiento con cantidad inválida; se omite restauración', movimiento);
          continue;
        }

        const { data: inventarioItems, error: inventarioError } = await supabaseClient
          .from('inventario')
          .select('id_inventario, cantidad_disponible, id_deposito, id_producto')
          .eq('id_producto', movimiento.producto.id_producto)
          .order('fecha_actualizacion', { ascending: false });

        if (inventarioError) {
          logger.error(`Error obteniendo inventario para producto ${movimiento.producto.nombre_producto}`, inventarioError);
          continue;
        }

        if (inventarioItems && inventarioItems.length > 0) {
          const item = inventarioItems[0];
          const nuevaCantidad = (item.cantidad_disponible ?? 0) + cantidadEntregada.value;

          const { error: updateError } = await supabaseClient
            .from('inventario')
            .update({
              cantidad_disponible: nuevaCantidad,
              fecha_actualizacion: new Date().toISOString(),
            })
            .eq('id_inventario', item.id_inventario);

          if (updateError) {
            logger.error(`Error restaurando inventario para producto ${movimiento.producto.nombre_producto}`, updateError);
            continue;
          }

          productosActualizados++;
          logger.info(`Restauradas ${movimiento.cantidadEntregada} unidades de ${movimiento.producto.nombre_producto} (nuevo stock: ${nuevaCantidad})`);
        } else {
          const { data: depositos, error: depositosError } = await supabaseClient
            .from('depositos')
            .select('id_deposito')
            .limit(1)
            .single();

          if (depositosError || !depositos) {
            logger.error(`No se pudo obtener un depósito para crear inventario de ${movimiento.producto.nombre_producto}`, depositosError);
            continue;
          }

          const { error: insertError } = await supabaseClient
            .from('inventario')
            .insert({
              id_producto: movimiento.producto.id_producto,
              id_deposito: depositos.id_deposito,
              cantidad_disponible: cantidadEntregada.value,
              fecha_actualizacion: new Date().toISOString(),
            });

          if (insertError) {
            logger.error(`Error creando inventario para producto ${movimiento.producto.nombre_producto}`, insertError);
            continue;
          }

          productosActualizados++;
          logger.info(`Creado nuevo registro de inventario con ${movimiento.cantidadEntregada} unidades de ${movimiento.producto.nombre_producto}`);
        }
      }

      return {
        success: true,
        data: { productosActualizados },
      };
    } catch (error) {
      logger.error('Error restaurando inventario', error);
      return {
        success: false,
        error: 'Error inesperado al restaurar el inventario',
        errorDetails: error,
      };
    }
  };

  const procesarDescuentoInventario = async (
    productos: ProductoInventario[],
    solicitud: Solicitud,
    depositoId?: string
  ): Promise<ResultadoInventario> => {
    let cantidadRestante = solicitud.cantidad;
    let productosActualizados = 0;
    const detalleEntregado: InventarioDescontado[] = [];

    for (const producto of productos) {
      if (cantidadRestante <= 0) break;
      const resultadoProducto = await descontarDeProducto(producto, cantidadRestante, solicitud, depositoId);

      cantidadRestante = resultadoProducto.cantidadRestante;
      productosActualizados += resultadoProducto.productosActualizados;

      if (resultadoProducto.cantidadEntregada > 0) {
        detalleEntregado.push({
          producto,
          cantidadEntregada: resultadoProducto.cantidadEntregada,
          cantidadOriginal: resultadoProducto.cantidadOriginal,
          unidadOriginalId: resultadoProducto.unidadOriginalId,
          unidadConvertidaId: resultadoProducto.unidadConvertidaId,
        });
      }

      if (resultadoProducto.error) {
        return {
          cantidadRestante,
          productosActualizados,
          detalleEntregado,
          error: true,
          errorDetails: resultadoProducto.errorDetails,
          noStock: detalleEntregado.length === 0,
        };
      }
    }

    const noStock = detalleEntregado.length === 0;

    return {
      cantidadRestante,
      productosActualizados,
      detalleEntregado,
      noStock,
    };
  };

  const descontarDeProducto = async (
    producto: ProductoInventario,
    cantidadNecesaria: number,
    solicitud: Solicitud,
    depositoId?: string
  ): Promise<DescuentoProductoResult> => {
    if (!isUuid(producto.id_producto)) {
      return {
        cantidadRestante: cantidadNecesaria,
        productosActualizados: 0,
        cantidadEntregada: 0,
        error: true,
        errorDetails: 'producto.id_producto debe ser un UUID valido.',
      };
    }

    if (!producto.unidad_id || !solicitud.unidad_id) {
      return {
        cantidadRestante: cantidadNecesaria,
        productosActualizados: 0,
        cantidadEntregada: 0,
        error: true,
        errorDetails: 'La solicitud y el producto deben tener una unidad explícita.',
      };
    }

    const conversion = await obtenerFactorConversion(solicitud.unidad_id, producto.unidad_id);
    if (!conversion.convertible) {
      return {
        cantidadRestante: cantidadNecesaria,
        productosActualizados: 0,
        cantidadEntregada: 0,
        error: true,
        errorDetails: `No existe conversión entre las unidades ${solicitud.unidad_id} y ${producto.unidad_id} para esta operación.`,
      };
    }

    const factorSolicitudAInventario = conversion.factor;
    const cantidadNecesariaEnUnidadInventario = cantidadNecesaria * factorSolicitudAInventario;

    let query = supabaseClient
      .from('inventario')
      .select('id_inventario, cantidad_disponible, id_deposito')
      .eq('id_producto', producto.id_producto)
      .gt('cantidad_disponible', 0);

    if (depositoId) {
      const parsedDepositoId = parseUuidValue(depositoId, { name: 'depositoId' });
      if (!parsedDepositoId.success) {
        return {
          cantidadRestante: cantidadNecesaria,
          productosActualizados: 0,
          cantidadEntregada: 0,
          error: true,
          errorDetails: parsedDepositoId.error,
        };
      }
      query = query.eq('id_deposito', parsedDepositoId.value);
    }

    const { data, error } = await query.order('fecha_actualizacion', { ascending: true });

    if (error || !data || data.length === 0) {
      logger.info(`Sin stock disponible para ${producto.nombre_producto}`);
      return {
        cantidadRestante: cantidadNecesaria,
        productosActualizados: 0,
        cantidadEntregada: 0,
      };
    }

    let cantidadRestante = cantidadNecesariaEnUnidadInventario;
    let productosActualizados = 0;
    let cantidadEntregada = 0;

    for (const item of data) {
      if (cantidadRestante <= 0) break;

      const cantidadADescontar = Math.min(cantidadRestante, item.cantidad_disponible);
      const nuevaCantidad = item.cantidad_disponible - cantidadADescontar;

      const { data: updatedItem, error: updateError } = await supabaseClient
        .from('inventario')
        .update({
          cantidad_disponible: nuevaCantidad,
          fecha_actualizacion: new Date().toISOString(),
        })
        .eq('id_inventario', item.id_inventario)
        .gte('cantidad_disponible', cantidadADescontar)
        .select('id_inventario')
        .maybeSingle();

      if (!updateError && !updatedItem) {
        return {
          cantidadRestante: cantidadRestante / factorSolicitudAInventario,
          productosActualizados,
          cantidadEntregada,
          cantidadOriginal: cantidadEntregada / factorSolicitudAInventario,
          unidadOriginalId: solicitud.unidad_id,
          unidadConvertidaId: producto.unidad_id,
          error: true,
          errorDetails: 'El stock cambió mientras se procesaba la entrega. Intenta nuevamente.',
        };
      }

      if (updateError) {
        logger.error('Error descontando inventario', updateError);

        return {
          cantidadRestante: cantidadRestante / factorSolicitudAInventario,
          productosActualizados,
          cantidadEntregada,
          cantidadOriginal: cantidadEntregada / factorSolicitudAInventario,
          unidadOriginalId: solicitud.unidad_id,
          unidadConvertidaId: producto.unidad_id,
          error: true,
          errorDetails: updateError,
        };
      }

      cantidadRestante -= cantidadADescontar;
      cantidadEntregada += cantidadADescontar;
      productosActualizados += 1;

      logger.info(`Descontadas ${cantidadADescontar} unidades de ${producto.nombre_producto} (restante en stock: ${nuevaCantidad})`);
    }

    return {
      cantidadRestante: cantidadRestante / factorSolicitudAInventario,
      productosActualizados,
      cantidadEntregada,
      cantidadOriginal: cantidadEntregada / factorSolicitudAInventario,
      unidadOriginalId: solicitud.unidad_id,
      unidadConvertidaId: producto.unidad_id,
    };
  };

  return {
    buscarProductosCoincidentes,
    obtenerFactorConversion,
    validarStockDisponible,
    validarStockDisponiblePorDeposito,
    descontarDelInventario,
    restaurarInventario,
  };
};

export type SolicitudesInventoryService = ReturnType<typeof createSolicitudesInventoryService>;
