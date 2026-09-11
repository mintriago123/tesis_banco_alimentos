import { and, eq, gt, ilike, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { entradasInventario, productosDonados } from '@/db/schema';
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
import { escapeLikePattern, isUuid, parseFiniteNumberValue, parsePositiveIntegerValue, parseUuidValue } from '@/lib/validation-core';

type Db = PostgresJsDatabase<typeof schema>;

interface StockRow {
  idEntrada: string;
  idDeposito: string;
  cantidadDisponible: string;
  unidadId: number | null;
}

interface DescontarStockRpcResult {
  detalles?: Array<{ idEntrada: unknown; idDeposito: unknown; cantidad: unknown; cantidadOriginal: unknown }>;
}

/** The Drizzle transaction passed here must be RLS-scoped (from `withRlsContext`) — `descontar_stock_por_lote`/`restaurar_entrada_inventario`/`resolver_conversion` are all SECURITY INVOKER. */
export const createSolicitudesInventoryService = (db: Db, logger: SolicitudesLogger = solicitudesLogger) => {
  const buscarProductosCoincidentes = async (tipoAlimento: string): Promise<ProductoInventario[]> => {
    const termino = tipoAlimento.trim();
    if (!termino) {
      return [];
    }

    const rows = await db
      .select({ id_producto: productosDonados.idProducto, nombre_producto: productosDonados.nombreProducto, unidad_id: productosDonados.unidadId })
      .from(productosDonados)
      .where(ilike(productosDonados.nombreProducto, `%${escapeLikePattern(termino)}%`));

    return rows;
  };

  const obtenerFactorConversion = async (unidadOrigenId: number, unidadDestinoId: number): Promise<ConversionResolution> => {
    const origen = parsePositiveIntegerValue(unidadOrigenId, { name: 'unidadOrigenId', min: 1 });
    const destino = parsePositiveIntegerValue(unidadDestinoId, { name: 'unidadDestinoId', min: 1 });

    if (!origen.success || !destino.success) {
      logger.warn('IDs de unidad inválidos para conversión', { unidadOrigenId, unidadDestinoId });
      return { convertible: false, reason: 'no_conversion' };
    }

    return resolverConversion(db, origen.value, destino.value);
  };

  const obtenerStockDeProducto = async (productoId: string, depositoId?: string, unidadId?: number): Promise<StockRow[]> => {
    const conditions = [eq(entradasInventario.idProducto, productoId), eq(entradasInventario.estado, 'disponible'), gt(entradasInventario.cantidadDisponible, '0')];
    if (depositoId) conditions.push(eq(entradasInventario.idDeposito, depositoId));
    if (unidadId) conditions.push(eq(entradasInventario.unidadId, unidadId));

    return db
      .select({
        idEntrada: entradasInventario.idEntrada,
        idDeposito: entradasInventario.idDeposito,
        cantidadDisponible: entradasInventario.cantidadDisponible,
        unidadId: entradasInventario.unidadId,
      })
      .from(entradasInventario)
      .where(and(...conditions));
  };

  const sumarStockConvertible = async (
    productos: ProductoInventario[],
    solicitud: Solicitud,
    depositoId: string | undefined,
  ): Promise<number> => {
    let totalDisponible = 0;

    for (const producto of productos) {
      const rows = await obtenerStockDeProducto(producto.id_producto, depositoId, producto.unidad_id ?? undefined);
      const stockProducto = rows.reduce((sum, item) => sum + Number(item.cantidadDisponible ?? 0), 0);

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

    return totalDisponible;
  };

  const validarStockDisponible = async (solicitud: Solicitud): Promise<{ suficiente: boolean; disponible: number; solicitado: number }> => {
    try {
      const cantidad = parseFiniteNumberValue(solicitud.cantidad, { name: 'solicitud.cantidad', min: 0 });
      if (!cantidad.success || cantidad.value <= 0) {
        logger.warn('Cantidad inválida para validar stock', { solicitudId: solicitud.id });
        return { suficiente: false, disponible: 0, solicitado: Number.isFinite(solicitud.cantidad) ? solicitud.cantidad : 0 };
      }

      if (!solicitud.unidad_id) {
        return { suficiente: false, disponible: 0, solicitado: cantidad.value };
      }

      const productosCoincidentes = await buscarProductosCoincidentes(solicitud.tipo_alimento);
      if (productosCoincidentes.length === 0) {
        return { suficiente: false, disponible: 0, solicitado: cantidad.value };
      }

      const totalDisponible = await sumarStockConvertible(productosCoincidentes, solicitud, undefined);
      return { suficiente: totalDisponible >= cantidad.value, disponible: totalDisponible, solicitado: cantidad.value };
    } catch (error) {
      logger.error('Error validando stock disponible', error);
      return { suficiente: false, disponible: 0, solicitado: solicitud.cantidad };
    }
  };

  const validarStockDisponiblePorDeposito = async (
    solicitud: Solicitud,
    depositoId: string,
    cantidadObjetivo: number,
  ): Promise<{ suficiente: boolean; disponible: number; solicitado: number }> => {
    try {
      const parsedDepositoId = parseUuidValue(depositoId, { name: 'depositoId' });
      const cantidad = parseFiniteNumberValue(cantidadObjetivo, { name: 'cantidadObjetivo', min: 0 });

      if (!parsedDepositoId.success || !cantidad.success || cantidad.value <= 0) {
        logger.warn('Parámetros inválidos para validar stock por depósito', { depositoId, cantidadObjetivo });
        return { suficiente: false, disponible: 0, solicitado: Number.isFinite(cantidadObjetivo) ? cantidadObjetivo : 0 };
      }

      if (!solicitud.unidad_id) {
        return { suficiente: false, disponible: 0, solicitado: cantidad.value };
      }

      const productosCoincidentes = await buscarProductosCoincidentes(solicitud.tipo_alimento);
      if (productosCoincidentes.length === 0) {
        return { suficiente: false, disponible: 0, solicitado: cantidad.value };
      }

      const totalDisponible = await sumarStockConvertible(productosCoincidentes, solicitud, parsedDepositoId.value);
      return { suficiente: totalDisponible >= cantidad.value, disponible: totalDisponible, solicitado: cantidad.value };
    } catch (error) {
      logger.error('Error validando stock por depósito', error);
      return { suficiente: false, disponible: 0, solicitado: cantidadObjetivo };
    }
  };

  const descontarDeProducto = async (
    producto: ProductoInventario,
    cantidadNecesaria: number,
    solicitud: Solicitud,
    depositoId?: string,
  ): Promise<DescuentoProductoResult> => {
    if (!isUuid(producto.id_producto)) {
      return { cantidadRestante: cantidadNecesaria, productosActualizados: 0, cantidadEntregada: 0, error: true, errorDetails: 'producto.id_producto debe ser un UUID valido.' };
    }

    if (!producto.unidad_id || !solicitud.unidad_id) {
      return { cantidadRestante: cantidadNecesaria, productosActualizados: 0, cantidadEntregada: 0, error: true, errorDetails: 'La solicitud y el producto deben tener una unidad explícita.' };
    }

    const conversion = await obtenerFactorConversion(solicitud.unidad_id, producto.unidad_id);
    if (!conversion.convertible) {
      logger.info('Producto omitido porque su unidad no es convertible para la solicitud', {
        producto: producto.nombre_producto,
        productoUnidadId: producto.unidad_id,
        solicitudUnidadId: solicitud.unidad_id,
        reason: conversion.reason,
      });
      return { cantidadRestante: cantidadNecesaria, productosActualizados: 0, cantidadEntregada: 0 };
    }

    if (!depositoId) {
      return { cantidadRestante: cantidadNecesaria, productosActualizados: 0, cantidadEntregada: 0, error: true, errorDetails: 'Debes seleccionar una bodega para descontar inventario.' };
    }

    const parsedDepositoId = parseUuidValue(depositoId, { name: 'depositoId' });
    if (!parsedDepositoId.success) {
      return { cantidadRestante: cantidadNecesaria, productosActualizados: 0, cantidadEntregada: 0, error: true, errorDetails: parsedDepositoId.error };
    }

    const entradasDisponibles = await obtenerStockDeProducto(producto.id_producto, parsedDepositoId.value, producto.unidad_id);
    const stockDisponibleProducto = entradasDisponibles.reduce((total, entrada) => total + Number(entrada.cantidadDisponible ?? 0), 0);
    const cantidadDisponibleEnSolicitud = stockDisponibleProducto / conversion.factor;

    if (!Number.isFinite(cantidadDisponibleEnSolicitud) || cantidadDisponibleEnSolicitud <= 0) {
      logger.info('Producto omitido porque no tiene stock compatible en la bodega seleccionada', {
        producto: producto.nombre_producto,
        productoId: producto.id_producto,
        depositoId: parsedDepositoId.value,
      });
      return { cantidadRestante: cantidadNecesaria, productosActualizados: 0, cantidadEntregada: 0 };
    }

    const cantidadParaDescontar = Math.min(cantidadNecesaria, cantidadDisponibleEnSolicitud);

    let payload: DescontarStockRpcResult | undefined;
    try {
      const [row] = await db.execute<{ resultado: DescontarStockRpcResult }>(
        sql`select descontar_stock_por_lote(${parsedDepositoId.value}::uuid, ${producto.id_producto}::uuid, ${cantidadParaDescontar}::numeric, ${solicitud.unidad_id}::bigint) as resultado`,
      );
      payload = row?.resultado;
    } catch (error) {
      logger.error('Error descontando stock por lote', error);
      return { cantidadRestante: cantidadNecesaria, productosActualizados: 0, cantidadEntregada: 0, error: true, errorDetails: error };
    }

    if (!payload || !Array.isArray(payload.detalles)) {
      return { cantidadRestante: cantidadNecesaria, productosActualizados: 0, cantidadEntregada: 0, error: true, errorDetails: 'La respuesta del descuento por lote no contiene detalles.' };
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

      const original = Number.isFinite(cantidadOriginalDetalle) && cantidadOriginalDetalle > 0 ? cantidadOriginalDetalle : cantidad / conversion.factor;

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
      return { cantidadRestante: cantidadNecesaria, productosActualizados: 0, cantidadEntregada: 0, error: true, errorDetails: 'El descuento no produjo entradas de inventario.' };
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

  const procesarDescuentoInventario = async (productos: ProductoInventario[], solicitud: Solicitud, depositoId?: string): Promise<ResultadoInventario> => {
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
        return { cantidadRestante, productosActualizados, detalleEntregado, error: true, errorDetails: resultadoProducto.errorDetails, noStock: detalleEntregado.length === 0 };
      }
    }

    return { cantidadRestante, productosActualizados, detalleEntregado, noStock: detalleEntregado.length === 0 };
  };

  const descontarDelInventario = async (solicitud: Solicitud, depositoId?: string): Promise<ResultadoInventario> => {
    try {
      if (!depositoId) {
        return { cantidadRestante: solicitud.cantidad, productosActualizados: 0, error: true, errorDetails: 'Debes seleccionar una bodega para descontar inventario.', detalleEntregado: [] };
      }

      const cantidad = parseFiniteNumberValue(solicitud.cantidad, { name: 'solicitud.cantidad', min: 0 });
      if (!cantidad.success || cantidad.value <= 0) {
        return { cantidadRestante: 0, productosActualizados: 0, error: true, errorDetails: cantidad.success ? 'solicitud.cantidad debe ser mayor a 0.' : cantidad.error, detalleEntregado: [] };
      }

      const parsedDepositoId = parseUuidValue(depositoId, { name: 'depositoId' });
      if (!parsedDepositoId.success) {
        return { cantidadRestante: solicitud.cantidad, productosActualizados: 0, error: true, errorDetails: parsedDepositoId.error, detalleEntregado: [] };
      }

      const productosCoincidentes = await buscarProductosCoincidentes(solicitud.tipo_alimento);
      if (productosCoincidentes.length === 0) {
        logger.warn(`No se encontraron productos coincidentes para ${solicitud.tipo_alimento}`);
        return { cantidadRestante: solicitud.cantidad, productosActualizados: 0, noStock: true, detalleEntregado: [] };
      }

      return procesarDescuentoInventario(productosCoincidentes, solicitud, parsedDepositoId.value);
    } catch (error) {
      logger.error('Error descontando inventario', error);
      return { cantidadRestante: solicitud.cantidad, productosActualizados: 0, error: true, errorDetails: error, detalleEntregado: [] };
    }
  };

  const restaurarInventario = async (movimientos: InventarioDescontado[]): Promise<ServiceResult<{ productosActualizados: number }>> => {
    try {
      let productosActualizados = 0;

      for (const movimiento of movimientos) {
        if (!isUuid(movimiento.producto.id_producto)) {
          logger.warn('Movimiento con id_producto inválido; se omite restauración', movimiento.producto);
          continue;
        }

        const cantidadEntregada = parseFiniteNumberValue(movimiento.cantidadEntregada, { name: 'cantidadEntregada', min: 0 });
        if (!cantidadEntregada.success || cantidadEntregada.value <= 0) {
          logger.warn('Movimiento con cantidad inválida; se omite restauración', movimiento);
          continue;
        }

        if (movimiento.idEntrada && isUuid(movimiento.idEntrada)) {
          try {
            await db.execute(sql`select restaurar_entrada_inventario(${movimiento.idEntrada}::uuid, ${cantidadEntregada.value}::numeric)`);
            productosActualizados++;
          } catch (error) {
            logger.error(`Error restaurando la entrada ${movimiento.idEntrada}`, error);
          }
          continue;
        }

        logger.warn(`No se puede restaurar ${movimiento.producto.nombre_producto} sin id_entrada explícito`, movimiento);
      }

      return { success: true, data: { productosActualizados } };
    } catch (error) {
      logger.error('Error restaurando inventario', error);
      return { success: false, error: 'Error inesperado al restaurar el inventario', errorDetails: error };
    }
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
