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

  const obtenerStockDeProducto = async (
    productoId: string,
    depositoId?: string,
    unidadId?: number,
  ) => {
    let query = supabaseClient
      .from('entradas_inventario')
      .select('id_entrada, id_deposito, cantidad_disponible, unidad_id')
      .eq('id_producto', productoId)
      .eq('estado', 'disponible')
      .gt('cantidad_disponible', 0);

    if (depositoId) {
      query = query.eq('id_deposito', depositoId);
    }

    if (unidadId) {
      query = query.eq('unidad_id', unidadId);
    }

    return query;
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
        const { data, error } = await obtenerStockDeProducto(
          producto.id_producto,
          undefined,
          producto.unidad_id,
        );

        if (error || !data) continue;

        const stockProducto = data.reduce((sum, item) => sum + Number(item.cantidad_disponible ?? 0), 0);

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
        const { data, error } = await obtenerStockDeProducto(
          producto.id_producto,
          parsedDepositoId.value,
          producto.unidad_id,
        );

        if (error || !data) continue;

        const stockProducto = data.reduce((sum, item) => sum + Number(item.cantidad_disponible ?? 0), 0);

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
      if (!depositoId) {
        return {
          cantidadRestante: solicitud.cantidad,
          productosActualizados: 0,
          error: true,
          errorDetails: 'Debes seleccionar una bodega para descontar inventario.',
          detalleEntregado: [],
        };
      }

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

      return procesarDescuentoInventario(productosCoincidentes, solicitud, parsedDepositoId.value);
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

        if (movimiento.idEntrada && isUuid(movimiento.idEntrada)) {
          const { error: restoreError } = await supabaseClient.rpc('restaurar_entrada_inventario', {
            p_id_entrada: movimiento.idEntrada,
            p_cantidad: cantidadEntregada.value,
          });

          if (restoreError) {
            logger.error(`Error restaurando la entrada ${movimiento.idEntrada}`, restoreError);
            continue;
          }

          productosActualizados++;
          continue;
        }

        logger.warn(
          `No se puede restaurar ${movimiento.producto.nombre_producto} sin id_entrada explícito`,
          movimiento,
        );
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
        if (resultadoProducto.detallesEntregados?.length) {
          detalleEntregado.push(...resultadoProducto.detallesEntregados);
        } else {
          detalleEntregado.push({
            producto,
            cantidadEntregada: resultadoProducto.cantidadEntregada,
            cantidadOriginal: resultadoProducto.cantidadOriginal,
            unidadOriginalId: resultadoProducto.unidadOriginalId,
            unidadConvertidaId: resultadoProducto.unidadConvertidaId,
            idDeposito: depositoId,
          });
        }
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
      logger.info('Producto omitido porque su unidad no es convertible para la solicitud', {
        producto: producto.nombre_producto,
        productoUnidadId: producto.unidad_id,
        solicitudUnidadId: solicitud.unidad_id,
        reason: conversion.reason,
      });
      return {
        cantidadRestante: cantidadNecesaria,
        productosActualizados: 0,
        cantidadEntregada: 0,
      };
    }

    if (!depositoId) {
      return {
        cantidadRestante: cantidadNecesaria,
        productosActualizados: 0,
        cantidadEntregada: 0,
        error: true,
        errorDetails: 'Debes seleccionar una bodega para descontar inventario.',
      };
    }

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

    const { data: entradasDisponibles, error: entradasError } = await obtenerStockDeProducto(
      producto.id_producto,
      parsedDepositoId.value,
      producto.unidad_id,
    );

    if (entradasError) {
      logger.error('Error consultando stock del producto antes del descuento', entradasError);
      return {
        cantidadRestante: cantidadNecesaria,
        productosActualizados: 0,
        cantidadEntregada: 0,
        error: true,
        errorDetails: entradasError,
      };
    }

    const stockDisponibleProducto = (entradasDisponibles ?? []).reduce(
      (total, entrada) => total + Number(entrada.cantidad_disponible ?? 0),
      0,
    );
    const cantidadDisponibleEnSolicitud = stockDisponibleProducto / conversion.factor;

    // El producto puede coincidir por nombre, pero no tener stock en la bodega
    // seleccionada. En ese caso se continúa con el siguiente producto compatible.
    if (!Number.isFinite(cantidadDisponibleEnSolicitud) || cantidadDisponibleEnSolicitud <= 0) {
      logger.info('Producto omitido porque no tiene stock compatible en la bodega seleccionada', {
        producto: producto.nombre_producto,
        productoId: producto.id_producto,
        depositoId: parsedDepositoId.value,
      });
      return {
        cantidadRestante: cantidadNecesaria,
        productosActualizados: 0,
        cantidadEntregada: 0,
      };
    }

    const cantidadParaDescontar = Math.min(cantidadNecesaria, cantidadDisponibleEnSolicitud);

    const { data, error } = await supabaseClient.rpc('descontar_stock_por_lote', {
      p_id_deposito: parsedDepositoId.value,
      p_id_producto: producto.id_producto,
      p_cantidad: cantidadParaDescontar,
      p_unidad_id: solicitud.unidad_id,
    });

    if (error || !data || typeof data !== 'object') {
      logger.error('Error descontando stock por lote', error ?? data);
      return {
        cantidadRestante: cantidadNecesaria,
        productosActualizados: 0,
        cantidadEntregada: 0,
        error: true,
        errorDetails: error ?? 'La respuesta del descuento por lote no es válida.',
      };
    }

    const payload = data as {
      detalles?: unknown;
    };
    if (!Array.isArray(payload.detalles)) {
      return {
        cantidadRestante: cantidadNecesaria,
        productosActualizados: 0,
        cantidadEntregada: 0,
        error: true,
        errorDetails: 'La respuesta del descuento por lote no contiene detalles.',
      };
    }

    const detallesEntregados: InventarioDescontado[] = [];
    let cantidadEntregada = 0;
    let cantidadOriginal = 0;

    for (const detalle of payload.detalles) {
      if (typeof detalle !== 'object' || detalle === null) continue;
      const item = detalle as Record<string, unknown>;
      const idEntrada = item.idEntrada;
      const idDeposito = item.idDeposito;
      const cantidad = Number(item.cantidad);
      const cantidadOriginalDetalle = Number(item.cantidadOriginal);

      if (!isUuid(idEntrada) || !isUuid(idDeposito) || !Number.isFinite(cantidad) || cantidad <= 0) {
        continue;
      }

      const original = Number.isFinite(cantidadOriginalDetalle) && cantidadOriginalDetalle > 0
        ? cantidadOriginalDetalle
        : cantidad / conversion.factor;

      detallesEntregados.push({
        producto,
        cantidadEntregada: cantidad,
        cantidadOriginal: original,
        unidadOriginalId: solicitud.unidad_id,
        unidadConvertidaId: producto.unidad_id,
        idEntrada,
        idDeposito,
      });
      cantidadEntregada += cantidad;
      cantidadOriginal += original;
    }

    if (detallesEntregados.length === 0) {
      return {
        cantidadRestante: cantidadNecesaria,
        productosActualizados: 0,
        cantidadEntregada: 0,
        error: true,
        errorDetails: 'El descuento no produjo entradas de inventario.',
      };
    }

    const cantidadRestante = Math.max(0, cantidadNecesaria - cantidadOriginal);
    return {
      cantidadRestante: Number.isFinite(cantidadRestante) ? cantidadRestante : cantidadNecesaria,
      productosActualizados: detallesEntregados.length,
      cantidadEntregada,
      cantidadOriginal,
      unidadOriginalId: solicitud.unidad_id,
      unidadConvertidaId: producto.unidad_id,
      detallesEntregados,
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
