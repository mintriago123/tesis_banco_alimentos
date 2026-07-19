import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InventarioDescontado,
  ServiceResult,
  Solicitud,
} from '../types';
import { solicitudesLogger, type SolicitudesLogger } from './solicitudesLogger';
import {
  escapeLikePattern,
  isUuid,
  parseFiniteNumberValue,
  parseUuidValue,
} from '@/lib/validation-core';

export const createSolicitudesMovementService = (
  supabaseClient: SupabaseClient,
  logger: SolicitudesLogger = solicitudesLogger
) => {
  const obtenerMovimientosEgresoSolicitud = async (solicitud: Solicitud): Promise<InventarioDescontado[]> => {
    try {
      const usuarioId = parseUuidValue(solicitud.usuario_id, { name: 'solicitud.usuario_id' });
      if (!usuarioId.success) {
        logger.warn('Solicitud con usuario_id inválido para consultar movimientos', { solicitudId: solicitud.id });
        return [];
      }

      const termino = solicitud.tipo_alimento.trim();
      if (!termino) {
        return [];
      }
      const terminoBusqueda = escapeLikePattern(termino);

      const fechaReferencia = solicitud.fecha_respuesta
        ? new Date(solicitud.fecha_respuesta)
        : new Date(solicitud.created_at);

      const { data: ultimaReversion, error: reversionError } = await supabaseClient
        .from('movimiento_inventario_cabecera')
        .select('id_movimiento, fecha_movimiento')
        .eq('id_solicitante', usuarioId.value)
        .ilike('observaciones', `%Reversión de solicitud%${terminoBusqueda}%`)
        .eq('estado_movimiento', 'completado')
        .order('fecha_movimiento', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reversionError) {
        logger.warn('Error obteniendo última reversión (continuando de todas formas)', reversionError);
      }

      let fechaMinima: Date;
      if (ultimaReversion) {
        fechaMinima = new Date(ultimaReversion.fecha_movimiento);
        logger.info(`Se encontró una reversión previa. Buscando movimientos de egreso después de ${fechaMinima.toISOString()}`);
      } else {
        fechaMinima = new Date(fechaReferencia);
        fechaMinima.setDate(fechaMinima.getDate() - 1);
        fechaMinima.setHours(0, 0, 0, 0);
        logger.info(`No se encontró reversión previa. Buscando movimientos de egreso desde ${fechaMinima.toISOString()}`);
      }

      const fechaMaxima = new Date(fechaReferencia);
      fechaMaxima.setDate(fechaMaxima.getDate() + 1);
      fechaMaxima.setHours(23, 59, 59, 999);

      const fechaMinimaStr = fechaMinima.toISOString().replace('Z', '');
      const fechaMaximaStr = fechaMaxima.toISOString().replace('Z', '');

      const { data: cabecerasEgreso, error: cabecerasError } = await supabaseClient
        .from('movimiento_inventario_cabecera')
        .select('id_movimiento, fecha_movimiento, observaciones')
        .eq('id_solicitante', usuarioId.value)
        .ilike('observaciones', `%Solicitud aprobada%${terminoBusqueda}%`)
        .eq('estado_movimiento', 'completado')
        .gte('fecha_movimiento', fechaMinimaStr)
        .lte('fecha_movimiento', fechaMaximaStr)
        .order('fecha_movimiento', { ascending: false });

      if (cabecerasError || !cabecerasEgreso || cabecerasEgreso.length === 0) {
        logger.warn('No se encontraron cabeceras de movimiento de egreso para la solicitud', cabecerasError);
        return [];
      }

      const idsMovimiento = cabecerasEgreso
        .map(c => c.id_movimiento)
        .filter(isUuid);

      if (idsMovimiento.length === 0) {
        return [];
      }

      const { data: detalles, error: detallesError } = await supabaseClient
        .from('movimiento_inventario_detalle')
        .select('id_movimiento, id_producto, cantidad, tipo_transaccion, unidad_id, observacion_detalle')
        .in('id_movimiento', idsMovimiento)
        .eq('tipo_transaccion', 'egreso')
        .ilike('observacion_detalle', `%Entrega por solicitud aprobada%${terminoBusqueda}%`);

      if (detallesError || !detalles || detalles.length === 0) {
        logger.warn('No se encontraron detalles de egreso para la solicitud', detallesError);
        return [];
      }

      const productosAgrupados = new Map<string, { cantidad: number; detalle: typeof detalles[0] }>();

      for (const detalle of detalles) {
        const productoId = detalle.id_producto;
        if (!isUuid(productoId)) {
          continue;
        }

        const cantidadResult = parseFiniteNumberValue(detalle.cantidad, {
          name: 'detalle.cantidad',
          min: 0,
        });
        if (!cantidadResult.success || cantidadResult.value <= 0) {
          continue;
        }

        if (productosAgrupados.has(productoId)) {
          productosAgrupados.get(productoId)!.cantidad += cantidadResult.value;
        } else {
          productosAgrupados.set(productoId, { cantidad: cantidadResult.value, detalle });
        }
      }

      const idsProducto = [...productosAgrupados.keys()];
      if (idsProducto.length === 0) {
        return [];
      }

      const { data: productos, error: productosError } = await supabaseClient
        .from('productos_donados')
        .select('id_producto, nombre_producto, unidad_id')
        .in('id_producto', idsProducto);

      if (productosError || !productos) {
        logger.error('Error obteniendo productos para los movimientos', productosError);
        return [];
      }

      const movimientos: InventarioDescontado[] = [];
      for (const [productoId, info] of productosAgrupados.entries()) {
        const producto = productos.find(p => p.id_producto === productoId);
        if (!producto) continue;

        movimientos.push({
          producto: {
            id_producto: producto.id_producto,
            nombre_producto: producto.nombre_producto,
            unidad_id: producto.unidad_id ?? undefined,
          },
          cantidadEntregada: info.cantidad,
        });
      }

      logger.info(`Se encontraron ${movimientos.length} productos para restaurar`);
      return movimientos;
    } catch (error) {
      logger.error('Error obteniendo movimientos de egreso de la solicitud', error);
      return [];
    }
  };

  const registrarMovimientoSolicitud = async (
    solicitud: Solicitud,
    resultado: { detalleEntregado: InventarioDescontado[] }
  ): Promise<ServiceResult<void>> => {
    try {
      const usuarioId = parseUuidValue(solicitud.usuario_id, { name: 'solicitud.usuario_id' });
      if (!usuarioId.success) {
        return { success: false, error: usuarioId.error };
      }

      if (resultado.detalleEntregado.length === 0) {
        return {
          success: false,
          error: 'No se registró movimiento porque no hubo descuento en inventario',
        };
      }

      const { data: authData, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !authData?.user) {
        return {
          success: false,
          error: 'No se pudo identificar al usuario que registra el movimiento',
          errorDetails: authError,
        };
      }

      const { data: cabecera, error: cabeceraError } = await supabaseClient
        .from('movimiento_inventario_cabecera')
        .insert({
          fecha_movimiento: new Date().toISOString(),
          id_donante: authData.user.id,
          id_solicitante: usuarioId.value,
          estado_movimiento: 'completado',
          observaciones: `Solicitud aprobada - ${solicitud.tipo_alimento} (${solicitud.cantidad} unidades)`,
        })
        .select('id_movimiento')
        .single();

      if (cabeceraError || !cabecera) {
        return {
          success: false,
          error: 'No fue posible registrar la cabecera del movimiento',
          errorDetails: cabeceraError,
        };
      }

      for (const detalle of resultado.detalleEntregado) {
        if (!isUuid(detalle.producto.id_producto)) {
          return {
            success: false,
            error: 'id_producto inválido en el detalle de inventario',
          };
        }

        const cantidad = parseFiniteNumberValue(detalle.cantidadEntregada, {
          name: 'cantidadEntregada',
          min: 0,
        });
        if (!cantidad.success || cantidad.value <= 0) {
          return {
            success: false,
            error: cantidad.success ? 'cantidadEntregada debe ser mayor a 0.' : cantidad.error,
          };
        }

        const { error: detalleError } = await supabaseClient
          .from('movimiento_inventario_detalle')
          .insert({
            id_movimiento: cabecera.id_movimiento,
            id_producto: detalle.producto.id_producto,
            cantidad: cantidad.value,
            tipo_transaccion: 'egreso',
            rol_usuario: 'beneficiario',
            observacion_detalle: `Entrega por solicitud aprobada - ${solicitud.tipo_alimento}`,
            unidad_id: detalle.producto.unidad_id ?? null,
          });

        if (detalleError) {
          return {
            success: false,
            error: 'No fue posible registrar el detalle del movimiento',
            errorDetails: detalleError,
          };
        }
      }

      return { success: true };
    } catch (error) {
      logger.error('Error registrando movimiento de solicitud', error);
      return {
        success: false,
        error: 'Error inesperado al registrar el movimiento',
        errorDetails: error,
      };
    }
  };

  const registrarMovimientoReversion = async (
    solicitud: Solicitud,
    movimientos: InventarioDescontado[]
  ): Promise<ServiceResult<void>> => {
    try {
      const usuarioId = parseUuidValue(solicitud.usuario_id, { name: 'solicitud.usuario_id' });
      if (!usuarioId.success) {
        return { success: false, error: usuarioId.error };
      }

      if (movimientos.length === 0) {
        return {
          success: false,
          error: 'No se registró movimiento de reversión porque no hay productos para restaurar',
        };
      }

      const { data: authData, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !authData?.user) {
        return {
          success: false,
          error: 'No se pudo identificar al usuario que registra la reversión',
          errorDetails: authError,
        };
      }

      const { data: cabecera, error: cabeceraError } = await supabaseClient
        .from('movimiento_inventario_cabecera')
        .insert({
          fecha_movimiento: new Date().toISOString(),
          id_donante: authData.user.id,
          id_solicitante: usuarioId.value,
          estado_movimiento: 'completado',
          observaciones: `Reversión de solicitud - ${solicitud.tipo_alimento} (${solicitud.cantidad} unidades)`,
        })
        .select('id_movimiento')
        .single();

      if (cabeceraError || !cabecera) {
        return {
          success: false,
          error: 'No fue posible registrar la cabecera de reversión',
          errorDetails: cabeceraError,
        };
      }

      for (const movimiento of movimientos) {
        if (!isUuid(movimiento.producto.id_producto)) {
          return {
            success: false,
            error: 'id_producto inválido en el movimiento de reversión',
          };
        }

        const cantidad = parseFiniteNumberValue(movimiento.cantidadEntregada, {
          name: 'cantidadEntregada',
          min: 0,
        });
        if (!cantidad.success || cantidad.value <= 0) {
          return {
            success: false,
            error: cantidad.success ? 'cantidadEntregada debe ser mayor a 0.' : cantidad.error,
          };
        }

        const { error: detalleError } = await supabaseClient
          .from('movimiento_inventario_detalle')
          .insert({
            id_movimiento: cabecera.id_movimiento,
            id_producto: movimiento.producto.id_producto,
            cantidad: cantidad.value,
            tipo_transaccion: 'ingreso',
            rol_usuario: 'beneficiario',
            observacion_detalle: `Reversión de solicitud aprobada - ${solicitud.tipo_alimento}`,
            unidad_id: movimiento.producto.unidad_id ?? null,
          });

        if (detalleError) {
          return {
            success: false,
            error: 'No fue posible registrar el detalle de reversión',
            errorDetails: detalleError,
          };
        }
      }

      logger.info('Movimiento de reversión registrado exitosamente');
      return { success: true };
    } catch (error) {
      logger.error('Error registrando movimiento de reversión', error);
      return {
        success: false,
        error: 'Error inesperado al registrar la reversión',
        errorDetails: error,
      };
    }
  };

  return {
    obtenerMovimientosEgresoSolicitud,
    registrarMovimientoSolicitud,
    registrarMovimientoReversion,
  };
};

export type SolicitudesMovementService = ReturnType<typeof createSolicitudesMovementService>;
