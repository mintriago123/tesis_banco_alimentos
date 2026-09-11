import { and, eq, gte, ilike, inArray, lte } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { movimientoInventarioCabecera, movimientoInventarioDetalle, productosDonados } from '@/db/schema';
import type { InventarioDescontado, ServiceResult, Solicitud } from '../types';
import { solicitudesLogger, type SolicitudesLogger } from './solicitudesLogger';
import { escapeLikePattern, isUuid, parseFiniteNumberValue, parseUuidValue } from '@/lib/validation-core';

type Db = PostgresJsDatabase<typeof schema>;

/** `actorUserId` is the admin/operador performing the action — resolved once from the session in the Server Action, not re-derived here. */
export const createSolicitudesMovementService = (db: Db, actorUserId: string, logger: SolicitudesLogger = solicitudesLogger) => {
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

      const fechaReferencia = solicitud.fecha_respuesta ? new Date(solicitud.fecha_respuesta) : new Date(solicitud.created_at);

      const [ultimaReversion] = await db
        .select({ idMovimiento: movimientoInventarioCabecera.idMovimiento, fechaMovimiento: movimientoInventarioCabecera.fechaMovimiento })
        .from(movimientoInventarioCabecera)
        .where(
          and(
            eq(movimientoInventarioCabecera.idSolicitante, usuarioId.value),
            ilike(movimientoInventarioCabecera.observaciones, `%Reversión de solicitud%${terminoBusqueda}%`),
            eq(movimientoInventarioCabecera.estadoMovimiento, 'completado'),
          ),
        )
        .orderBy(movimientoInventarioCabecera.fechaMovimiento)
        .limit(1);

      let fechaMinima: Date;
      if (ultimaReversion?.fechaMovimiento) {
        fechaMinima = new Date(ultimaReversion.fechaMovimiento);
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

      const cabecerasEgreso = await db
        .select({ idMovimiento: movimientoInventarioCabecera.idMovimiento })
        .from(movimientoInventarioCabecera)
        .where(
          and(
            eq(movimientoInventarioCabecera.idSolicitante, usuarioId.value),
            ilike(movimientoInventarioCabecera.observaciones, `%Solicitud aprobada%${terminoBusqueda}%`),
            eq(movimientoInventarioCabecera.estadoMovimiento, 'completado'),
            gte(movimientoInventarioCabecera.fechaMovimiento, fechaMinima),
            lte(movimientoInventarioCabecera.fechaMovimiento, fechaMaxima),
          ),
        );

      if (cabecerasEgreso.length === 0) {
        logger.warn('No se encontraron cabeceras de movimiento de egreso para la solicitud');
        return [];
      }

      const idsMovimiento = cabecerasEgreso.map((c) => c.idMovimiento).filter(isUuid);
      if (idsMovimiento.length === 0) {
        return [];
      }

      const detalles = await db
        .select({
          idProducto: movimientoInventarioDetalle.idProducto,
          cantidad: movimientoInventarioDetalle.cantidad,
          cantidadOriginal: movimientoInventarioDetalle.cantidadOriginal,
          unidadId: movimientoInventarioDetalle.unidadId,
          unidadConvertidaId: movimientoInventarioDetalle.unidadConvertidaId,
          idEntrada: movimientoInventarioDetalle.idEntrada,
          idDeposito: movimientoInventarioDetalle.idDeposito,
        })
        .from(movimientoInventarioDetalle)
        .where(
          and(
            inArray(movimientoInventarioDetalle.idMovimiento, idsMovimiento),
            eq(movimientoInventarioDetalle.tipoTransaccion, 'egreso'),
            ilike(movimientoInventarioDetalle.observacionDetalle, `%Entrega por solicitud aprobada%${terminoBusqueda}%`),
          ),
        );

      if (detalles.length === 0) {
        logger.warn('No se encontraron detalles de egreso para la solicitud');
        return [];
      }

      const detallesValidos = detalles.filter((detalle) => {
        if (!isUuid(detalle.idProducto)) return false;
        const cantidadResult = parseFiniteNumberValue(detalle.cantidad, { name: 'detalle.cantidad', min: 0 });
        return cantidadResult.success && cantidadResult.value > 0;
      });

      const idsProductoArray = [...new Set(detallesValidos.map((d) => d.idProducto))];
      if (idsProductoArray.length === 0) {
        return [];
      }

      const productos = await db
        .select({ idProducto: productosDonados.idProducto, nombreProducto: productosDonados.nombreProducto, unidadId: productosDonados.unidadId })
        .from(productosDonados)
        .where(inArray(productosDonados.idProducto, idsProductoArray));

      const movimientos: InventarioDescontado[] = [];
      for (const detalle of detallesValidos) {
        const producto = productos.find((p) => p.idProducto === detalle.idProducto);
        if (!producto) continue;

        movimientos.push({
          producto: { id_producto: producto.idProducto, nombre_producto: producto.nombreProducto, unidad_id: producto.unidadId ?? undefined },
          cantidadEntregada: Number(detalle.cantidad),
          cantidadOriginal: detalle.cantidadOriginal ? Number(detalle.cantidadOriginal) : undefined,
          unidadOriginalId: detalle.unidadId ?? undefined,
          unidadConvertidaId: detalle.unidadConvertidaId ?? producto.unidadId ?? undefined,
          idEntrada: detalle.idEntrada ?? undefined,
          idDeposito: detalle.idDeposito ?? undefined,
        });
      }

      logger.info(`Se encontraron ${movimientos.length} productos para restaurar`);
      return movimientos;
    } catch (error) {
      logger.error('Error obteniendo movimientos de egreso de la solicitud', error);
      return [];
    }
  };

  const registrarMovimientoSolicitud = async (solicitud: Solicitud, resultado: { detalleEntregado: InventarioDescontado[] }): Promise<ServiceResult<void>> => {
    try {
      const usuarioId = parseUuidValue(solicitud.usuario_id, { name: 'solicitud.usuario_id' });
      if (!usuarioId.success) {
        return { success: false, error: usuarioId.error };
      }

      if (resultado.detalleEntregado.length === 0) {
        return { success: false, error: 'No se registró movimiento porque no hubo descuento en inventario' };
      }

      const [cabecera] = await db
        .insert(movimientoInventarioCabecera)
        .values({
          fechaMovimiento: new Date(),
          idDonante: actorUserId,
          idSolicitante: usuarioId.value,
          estadoMovimiento: 'completado',
          observaciones: `Solicitud aprobada - ${solicitud.tipo_alimento} (${solicitud.cantidad} unidades)`,
        })
        .returning({ idMovimiento: movimientoInventarioCabecera.idMovimiento });

      if (!cabecera) {
        return { success: false, error: 'No fue posible registrar la cabecera del movimiento' };
      }

      for (const detalle of resultado.detalleEntregado) {
        if (!isUuid(detalle.producto.id_producto)) {
          return { success: false, error: 'id_producto inválido en el detalle de inventario' };
        }

        const cantidad = parseFiniteNumberValue(detalle.cantidadEntregada, { name: 'cantidadEntregada', min: 0 });
        if (!cantidad.success || cantidad.value <= 0) {
          return { success: false, error: cantidad.success ? 'cantidadEntregada debe ser mayor a 0.' : cantidad.error };
        }

        try {
          await db.insert(movimientoInventarioDetalle).values({
            idMovimiento: cabecera.idMovimiento,
            idProducto: detalle.producto.id_producto,
            cantidad: String(cantidad.value),
            cantidadOriginal: String(detalle.cantidadOriginal ?? cantidad.value),
            tipoTransaccion: 'egreso',
            rolUsuario: 'beneficiario',
            observacionDetalle: `Entrega por solicitud aprobada - ${solicitud.tipo_alimento}`,
            unidadId: detalle.unidadOriginalId ?? solicitud.unidad_id ?? detalle.producto.unidad_id ?? null,
            unidadConvertidaId: detalle.unidadConvertidaId ?? detalle.producto.unidad_id ?? null,
            idEntrada: detalle.idEntrada ?? null,
            idDeposito: detalle.idDeposito ?? null,
          });
        } catch (detalleError) {
          return { success: false, error: 'No fue posible registrar el detalle del movimiento', errorDetails: detalleError };
        }
      }

      return { success: true };
    } catch (error) {
      logger.error('Error registrando movimiento de solicitud', error);
      return { success: false, error: 'Error inesperado al registrar el movimiento', errorDetails: error };
    }
  };

  const registrarMovimientoReversion = async (solicitud: Solicitud, movimientos: InventarioDescontado[]): Promise<ServiceResult<void>> => {
    try {
      const usuarioId = parseUuidValue(solicitud.usuario_id, { name: 'solicitud.usuario_id' });
      if (!usuarioId.success) {
        return { success: false, error: usuarioId.error };
      }

      if (movimientos.length === 0) {
        return { success: false, error: 'No se registró movimiento de reversión porque no hay productos para restaurar' };
      }

      const [cabecera] = await db
        .insert(movimientoInventarioCabecera)
        .values({
          fechaMovimiento: new Date(),
          idDonante: actorUserId,
          idSolicitante: usuarioId.value,
          estadoMovimiento: 'completado',
          observaciones: `Reversión de solicitud - ${solicitud.tipo_alimento} (${solicitud.cantidad} unidades)`,
        })
        .returning({ idMovimiento: movimientoInventarioCabecera.idMovimiento });

      if (!cabecera) {
        return { success: false, error: 'No fue posible registrar la cabecera de reversión' };
      }

      for (const movimiento of movimientos) {
        if (!isUuid(movimiento.producto.id_producto)) {
          return { success: false, error: 'id_producto inválido en el movimiento de reversión' };
        }

        const cantidad = parseFiniteNumberValue(movimiento.cantidadEntregada, { name: 'cantidadEntregada', min: 0 });
        if (!cantidad.success || cantidad.value <= 0) {
          return { success: false, error: cantidad.success ? 'cantidadEntregada debe ser mayor a 0.' : cantidad.error };
        }

        try {
          await db.insert(movimientoInventarioDetalle).values({
            idMovimiento: cabecera.idMovimiento,
            idProducto: movimiento.producto.id_producto,
            cantidad: String(cantidad.value),
            cantidadOriginal: String(movimiento.cantidadOriginal ?? cantidad.value),
            tipoTransaccion: 'ingreso',
            rolUsuario: 'beneficiario',
            observacionDetalle: `Reversión de solicitud aprobada - ${solicitud.tipo_alimento}`,
            unidadId: movimiento.unidadOriginalId ?? solicitud.unidad_id ?? movimiento.producto.unidad_id ?? null,
            unidadConvertidaId: movimiento.unidadConvertidaId ?? movimiento.producto.unidad_id ?? null,
            idEntrada: movimiento.idEntrada ?? null,
            idDeposito: movimiento.idDeposito ?? null,
          });
        } catch (detalleError) {
          return { success: false, error: 'No fue posible registrar el detalle de reversión', errorDetails: detalleError };
        }
      }

      logger.info('Movimiento de reversión registrado exitosamente');
      return { success: true };
    } catch (error) {
      logger.error('Error registrando movimiento de reversión', error);
      return { success: false, error: 'Error inesperado al registrar la reversión', errorDetails: error };
    }
  };

  return { obtenerMovimientosEgresoSolicitud, registrarMovimientoSolicitud, registrarMovimientoReversion };
};

export type SolicitudesMovementService = ReturnType<typeof createSolicitudesMovementService>;
