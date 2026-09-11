import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Tx } from '@/db/client';
import { movimientoInventarioCabecera, movimientoInventarioDetalle, productosDonados, unidades, usuarios } from '@/db/schema';
import type { MovementItem, ServiceResult } from '../types';
import { DEFAULT_VALUES } from '../constants';

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = {
  error: (message: string, error?: unknown) => console.error(`[MovementDataService] ${message}`, error),
  warn: (message: string, details?: unknown) => console.warn(`[MovementDataService] ${message}`, details),
  info: (message: string, details?: unknown) => {
    if (isDevelopment) console.info(`[MovementDataService] ${message}`, details);
  },
};

const donanteUsuarios = alias(usuarios, 'donante_usuarios');
const solicitanteUsuarios = alias(usuarios, 'solicitante_usuarios');

function validateQuantity(cantidad: unknown): number {
  if (typeof cantidad === 'number' && !Number.isNaN(cantidad) && cantidad >= 0) {
    return cantidad;
  }

  if (typeof cantidad === 'string') {
    const parsed = Number.parseFloat(cantidad);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  logger.warn('Cantidad inválida detectada, usando valor por defecto', { cantidad });
  return DEFAULT_VALUES.fallbackQuantity;
}

function validateDate(fecha: Date | null): string {
  if (fecha && !Number.isNaN(fecha.getTime())) {
    return fecha.toISOString();
  }

  logger.warn('Fecha inválida detectada, usando fecha actual', { fecha });
  return new Date().toISOString();
}

/** Ported from `createMovementDataService(supabaseClient)` — now takes an RLS-scoped Drizzle `Tx` instead. */
export const createMovementDataService = (tx: Tx) => {
  const getAllMovements = async (): Promise<ServiceResult<MovementItem[]>> => {
    try {
      logger.info('Iniciando carga completa de movimientos');

      const rows = await tx
        .select({
          idMovimiento: movimientoInventarioCabecera.idMovimiento,
          idDetalle: movimientoInventarioDetalle.idDetalle,
          fechaMovimiento: movimientoInventarioCabecera.fechaMovimiento,
          observacionesCabecera: movimientoInventarioCabecera.observaciones,
          donanteNombre: donanteUsuarios.nombre,
          donanteRol: donanteUsuarios.rol,
          solicitanteNombre: solicitanteUsuarios.nombre,
          solicitanteRol: solicitanteUsuarios.rol,
          cantidad: movimientoInventarioDetalle.cantidad,
          tipoTransaccion: movimientoInventarioDetalle.tipoTransaccion,
          observacionDetalle: movimientoInventarioDetalle.observacionDetalle,
          productoNombre: productosDonados.nombreProducto,
          unidadNombre: unidades.nombre,
          unidadSimbolo: unidades.simbolo,
        })
        .from(movimientoInventarioCabecera)
        .innerJoin(movimientoInventarioDetalle, eq(movimientoInventarioCabecera.idMovimiento, movimientoInventarioDetalle.idMovimiento))
        .innerJoin(productosDonados, eq(movimientoInventarioDetalle.idProducto, productosDonados.idProducto))
        .leftJoin(unidades, eq(productosDonados.unidadId, unidades.id))
        .leftJoin(donanteUsuarios, eq(movimientoInventarioCabecera.idDonante, donanteUsuarios.id))
        .leftJoin(solicitanteUsuarios, eq(movimientoInventarioCabecera.idSolicitante, solicitanteUsuarios.id))
        .orderBy(desc(movimientoInventarioCabecera.fechaMovimiento));

      const movements: MovementItem[] = rows.map((row) => {
        const esIngreso = row.tipoTransaccion === 'ingreso';
        const usuarioResponsable = esIngreso ? row.donanteNombre || DEFAULT_VALUES.unknownUser : row.solicitanteNombre || DEFAULT_VALUES.unknownUser;
        const rolUsuario = (esIngreso ? row.donanteRol || 'DONANTE' : row.solicitanteRol || 'BENEFICIARIO') as MovementItem['rol_usuario'];
        const unidadMedida = row.unidadSimbolo ?? row.unidadNombre ?? DEFAULT_VALUES.defaultUnit;

        return {
          id: `current-${row.idMovimiento}-${row.idDetalle}`,
          fecha_movimiento: validateDate(row.fechaMovimiento),
          tipo_movimiento: row.tipoTransaccion === 'ingreso' ? 'ingreso' : 'egreso',
          nombre_producto: row.productoNombre || DEFAULT_VALUES.unknownProduct,
          unidad_medida: unidadMedida,
          cantidad: validateQuantity(row.cantidad),
          usuario_responsable: usuarioResponsable,
          rol_usuario: rolUsuario,
          origen_movimiento: esIngreso ? 'Donación Registrada' : 'Solicitud Aprobada',
          observaciones: row.observacionDetalle || row.observacionesCabecera || DEFAULT_VALUES.noObservations,
        };
      });

      movements.sort((a, b) => new Date(b.fecha_movimiento).getTime() - new Date(a.fecha_movimiento).getTime());

      logger.info(`Carga completa finalizada: ${movements.length} movimientos totales`);
      return { success: true, data: movements };
    } catch (error) {
      logger.error('Error en carga completa de movimientos', error);
      return { success: false, error: 'Error al cargar los datos de movimientos', errorDetails: error };
    }
  };

  return { getAllMovements };
};
