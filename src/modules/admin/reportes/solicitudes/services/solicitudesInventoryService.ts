import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DescuentoProductoResult,
  InventarioDescontado,
  ProductoInventario,
  ResultadoInventario,
  ServiceResult,
  Solicitud,
} from '../types';
import { solicitudesLogger, type SolicitudesLogger } from './solicitudesLogger';

export const createSolicitudesInventoryService = (
  supabaseClient: SupabaseClient,
  logger: SolicitudesLogger = solicitudesLogger
) => {
  const buscarProductosCoincidentes = async (tipoAlimento: string): Promise<ProductoInventario[]> => {
    const { data, error } = await supabaseClient
      .from('productos_donados')
      .select('id_producto, nombre_producto, unidad_id')
      .ilike('nombre_producto', `%${tipoAlimento}%`);

    if (error) {
      throw error;
    }

    return (data as ProductoInventario[] | null | undefined) ?? [];
  };

  const obtenerFactorConversion = async (
    unidadOrigenId: number,
    unidadDestinoId: number
  ): Promise<number | null> => {
    if (unidadOrigenId === unidadDestinoId) {
      return 1;
    }

    try {
      const { data: unidades, error: unidadesError } = await supabaseClient
        .from('unidades')
        .select('id, tipo_magnitud_id, es_base')
        .in('id', [unidadOrigenId, unidadDestinoId]);

      if (unidadesError || !unidades || unidades.length !== 2) {
        logger.warn('No se pudieron obtener las unidades para conversión', unidadesError);
        return null;
      }

      const unidadOrigen = unidades.find(u => u.id === unidadOrigenId);
      const unidadDestino = unidades.find(u => u.id === unidadDestinoId);

      if (!unidadOrigen || !unidadDestino || unidadOrigen.tipo_magnitud_id !== unidadDestino.tipo_magnitud_id) {
        logger.warn('Las unidades no son de la misma magnitud', { unidadOrigen, unidadDestino });
        return null;
      }

      const { data: conversionDirecta, error: convError1 } = await supabaseClient
        .from('conversiones')
        .select('factor_conversion')
        .eq('unidad_origen_id', unidadOrigenId)
        .eq('unidad_destino_id', unidadDestinoId)
        .maybeSingle();

      if (!convError1 && conversionDirecta) {
        return Number(conversionDirecta.factor_conversion);
      }

      const { data: conversionInversa, error: convError2 } = await supabaseClient
        .from('conversiones')
        .select('factor_conversion')
        .eq('unidad_origen_id', unidadDestinoId)
        .eq('unidad_destino_id', unidadOrigenId)
        .maybeSingle();

      if (!convError2 && conversionInversa) {
        return 1 / Number(conversionInversa.factor_conversion);
      }

      logger.warn('No se encontró conversión entre las unidades', { unidadOrigenId, unidadDestinoId });
      return null;
    } catch (error) {
      logger.error('Error al obtener factor de conversión', error);
      return null;
    }
  };

  const validarStockDisponible = async (
    solicitud: Solicitud
  ): Promise<{ suficiente: boolean; disponible: number; solicitado: number }> => {
    try {
      const productosCoincidentes = await buscarProductosCoincidentes(solicitud.tipo_alimento);

      if (!productosCoincidentes || productosCoincidentes.length === 0) {
        return {
          suficiente: false,
          disponible: 0,
          solicitado: solicitud.cantidad,
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

        let stockConvertido = stockProducto;
        if (producto.unidad_id && solicitud.unidad_id && producto.unidad_id !== solicitud.unidad_id) {
          const factorConversion = await obtenerFactorConversion(producto.unidad_id, solicitud.unidad_id);
          if (factorConversion !== null) {
            stockConvertido = stockProducto * factorConversion;
          }
        }

        totalDisponible += stockConvertido;
      }

      return {
        suficiente: totalDisponible >= solicitud.cantidad,
        disponible: totalDisponible,
        solicitado: solicitud.cantidad,
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
      const productosCoincidentes = await buscarProductosCoincidentes(solicitud.tipo_alimento);

      if (!productosCoincidentes || productosCoincidentes.length === 0) {
        return {
          suficiente: false,
          disponible: 0,
          solicitado: cantidadObjetivo,
        };
      }

      let totalDisponible = 0;

      for (const producto of productosCoincidentes) {
        const { data, error } = await supabaseClient
          .from('inventario')
          .select('cantidad_disponible')
          .eq('id_producto', producto.id_producto)
          .eq('id_deposito', depositoId)
          .gt('cantidad_disponible', 0);

        if (error || !data) continue;

        const stockProducto = data.reduce((sum, item) => sum + (item.cantidad_disponible ?? 0), 0);

        let stockConvertido = stockProducto;
        if (producto.unidad_id && solicitud.unidad_id && producto.unidad_id !== solicitud.unidad_id) {
          const factorConversion = await obtenerFactorConversion(producto.unidad_id, solicitud.unidad_id);
          if (factorConversion !== null) {
            stockConvertido = stockProducto * factorConversion;
          }
        }

        totalDisponible += stockConvertido;
      }

      return {
        suficiente: totalDisponible >= cantidadObjetivo,
        disponible: totalDisponible,
        solicitado: cantidadObjetivo,
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
          const nuevaCantidad = (item.cantidad_disponible ?? 0) + movimiento.cantidadEntregada;

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
              cantidad_disponible: movimiento.cantidadEntregada,
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
    let query = supabaseClient
      .from('inventario')
      .select('id_inventario, cantidad_disponible, id_deposito')
      .eq('id_producto', producto.id_producto)
      .gt('cantidad_disponible', 0);

    if (depositoId) {
      query = query.eq('id_deposito', depositoId);
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

    let cantidadNecesariaEnUnidadInventario = cantidadNecesaria;

    if (!producto.unidad_id) {
      logger.warn(`El producto "${producto.nombre_producto}" no tiene unidad_id definida. Se usará la cantidad directa: ${cantidadNecesaria}`);
    } else if (!solicitud.unidad_id) {
      logger.warn(`La solicitud no tiene unidad_id definida. Se usará la cantidad directa: ${cantidadNecesaria}`);
    } else if (solicitud.unidad_id !== producto.unidad_id) {
      const factorConversion = await obtenerFactorConversion(solicitud.unidad_id, producto.unidad_id);

      if (factorConversion === null) {
        logger.warn(`No se encontró conversión entre unidad ${solicitud.unidad_id} y ${producto.unidad_id}. Se usará la cantidad sin conversión: ${cantidadNecesaria}`);
      } else {
        cantidadNecesariaEnUnidadInventario = cantidadNecesaria * factorConversion;
      }
    }

    let cantidadRestante = cantidadNecesariaEnUnidadInventario;
    let productosActualizados = 0;
    let cantidadEntregada = 0;

    for (const item of data) {
      if (cantidadRestante <= 0) break;

      const cantidadADescontar = Math.min(cantidadRestante, item.cantidad_disponible);
      const nuevaCantidad = item.cantidad_disponible - cantidadADescontar;

      const { error: updateError } = await supabaseClient
        .from('inventario')
        .update({
          cantidad_disponible: nuevaCantidad,
          fecha_actualizacion: new Date().toISOString(),
        })
        .eq('id_inventario', item.id_inventario);

      if (updateError) {
        logger.error('Error descontando inventario', updateError);
        const cantidadRestanteOriginal = await convertirCantidadRestante(
          cantidadRestante,
          producto.unidad_id,
          solicitud.unidad_id
        );

        return {
          cantidadRestante: cantidadRestanteOriginal,
          productosActualizados,
          cantidadEntregada,
          error: true,
          errorDetails: updateError,
        };
      }

      cantidadRestante -= cantidadADescontar;
      cantidadEntregada += cantidadADescontar;
      productosActualizados += 1;

      logger.info(`Descontadas ${cantidadADescontar} unidades de ${producto.nombre_producto} (restante en stock: ${nuevaCantidad})`);
    }

    const cantidadRestanteOriginal = await convertirCantidadRestante(
      cantidadRestante,
      producto.unidad_id,
      solicitud.unidad_id
    );

    return {
      cantidadRestante: cantidadRestanteOriginal,
      productosActualizados,
      cantidadEntregada,
    };
  };

  const convertirCantidadRestante = async (
    cantidadRestante: number,
    unidadProductoId?: number,
    unidadSolicitudId?: number
  ): Promise<number> => {
    if (!unidadProductoId || !unidadSolicitudId || unidadSolicitudId === unidadProductoId) {
      return cantidadRestante;
    }

    const factorConversion = await obtenerFactorConversion(unidadProductoId, unidadSolicitudId);
    return factorConversion === null ? cantidadRestante : cantidadRestante * factorConversion;
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
