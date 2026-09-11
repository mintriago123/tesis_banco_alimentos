/**
 * @fileoverview Servicio de datos de inventario específico para operadores.
 */

import { and, desc, eq, gt, lt } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { alimentos, depositos, entradasInventario, movimientoInventarioCabecera, movimientoInventarioDetalle, productosDonados, unidades } from '@/db/schema';
import type { AlertaInventario, Deposito, InventarioItem, OperadorInventarioStats, ServiceResult } from '../types';
import { isUuid, parseFiniteNumberValue, parseUuidValue } from '@/lib/validation-core';

type OperadorStatsRow = { cantidad_disponible: number | null; fecha_vencimiento: string | null };

const STOCK_LEVELS = { BAJO: 10, NORMAL: 50, ALTO: 50 } as const;
const DAYS_TO_EXPIRE = { PROXIMO: 30, CRITICO: 7 } as const;

const isDevelopment = process.env.NODE_ENV === 'development';
const logger = {
  info: (message: string, details?: unknown) => {
    if (isDevelopment) console.info(`[OperadorInventoryService] ${message}`, details);
  },
  error: (message: string, error?: unknown) => console.error(`[OperadorInventoryService] ${message}`, error),
};

const INVENTARIO_SELECT = {
  idEntrada: entradasInventario.idEntrada,
  idDeposito: entradasInventario.idDeposito,
  idProducto: entradasInventario.idProducto,
  unidadId: entradasInventario.unidadId,
  cantidadDisponible: entradasInventario.cantidadDisponible,
  fechaIngreso: entradasInventario.fechaIngreso,
  fechaVencimiento: entradasInventario.fechaVencimiento,
  updatedAt: entradasInventario.updatedAt,
  depositoId: depositos.idDeposito,
  depositoNombre: depositos.nombre,
  depositoDescripcion: depositos.descripcion,
  productoId: productosDonados.idProducto,
  productoNombre: productosDonados.nombreProducto,
  productoDescripcion: productosDonados.descripcion,
  productoUnidadId: productosDonados.unidadId,
  productoUnidadNombre: unidades.nombre,
  productoUnidadSimbolo: unidades.simbolo,
  productoCategoria: alimentos.categoria,
} as const;

type InventarioSelectRow = {
  idEntrada: string;
  idDeposito: string;
  idProducto: string;
  unidadId: number | null;
  cantidadDisponible: string;
  fechaIngreso: Date;
  fechaVencimiento: string | null;
  updatedAt: Date;
  depositoId: string;
  depositoNombre: string;
  depositoDescripcion: string | null;
  productoId: string;
  productoNombre: string | null;
  productoDescripcion: string | null;
  productoUnidadId: number | null;
  productoUnidadNombre: string | null;
  productoUnidadSimbolo: string | null;
  productoCategoria: string | null;
};

/** `actorUserId` is the operador/administrador performing adjustments — resolved once from the session. */
export const createOperadorInventoryDataService = (tx: Tx, actorUserId: string) => {
  const fetchInventario = async (): Promise<ServiceResult<InventarioItem[]>> => {
    try {
      logger.info('Consultando inventario para operador');

      const rows = await tx
        .select(INVENTARIO_SELECT)
        .from(entradasInventario)
        .innerJoin(depositos, eq(entradasInventario.idDeposito, depositos.idDeposito))
        .innerJoin(productosDonados, eq(entradasInventario.idProducto, productosDonados.idProducto))
        .leftJoin(unidades, eq(productosDonados.unidadId, unidades.id))
        .leftJoin(alimentos, eq(productosDonados.alimentoId, alimentos.id))
        .where(and(eq(entradasInventario.estado, 'disponible'), gt(entradasInventario.cantidadDisponible, '0')))
        .orderBy(desc(entradasInventario.updatedAt));

      logger.info('Datos de inventario recibidos', { count: rows.length });
      const mappedData = rows.map(mapInventarioRowToDomain);
      return { success: true, data: mappedData };
    } catch (error) {
      logger.error('Excepción obteniendo inventario', error);
      return { success: false, error: 'Error inesperado al cargar inventario', errorDetails: error };
    }
  };

  const fetchProductosConAlertas = async (): Promise<ServiceResult<InventarioItem[]>> => {
    try {
      const rows = await tx
        .select(INVENTARIO_SELECT)
        .from(entradasInventario)
        .innerJoin(depositos, eq(entradasInventario.idDeposito, depositos.idDeposito))
        .innerJoin(productosDonados, eq(entradasInventario.idProducto, productosDonados.idProducto))
        .leftJoin(unidades, eq(productosDonados.unidadId, unidades.id))
        .leftJoin(alimentos, eq(productosDonados.alimentoId, alimentos.id))
        .where(and(eq(entradasInventario.estado, 'disponible'), lt(entradasInventario.cantidadDisponible, String(STOCK_LEVELS.BAJO))))
        .orderBy(entradasInventario.cantidadDisponible);

      const inventario = rows.map(mapInventarioRowToDomain).filter((item) => item.necesita_atencion);
      return { success: true, data: inventario };
    } catch (error) {
      logger.error('Excepción obteniendo productos con alertas', error);
      return { success: false, error: 'Error inesperado al cargar productos con alertas', errorDetails: error };
    }
  };

  const fetchOperadorStats = async (): Promise<ServiceResult<OperadorInventarioStats>> => {
    try {
      const rows = await tx
        .select({ cantidadDisponible: entradasInventario.cantidadDisponible, fechaVencimiento: entradasInventario.fechaVencimiento })
        .from(entradasInventario)
        .where(and(eq(entradasInventario.estado, 'disponible'), gt(entradasInventario.cantidadDisponible, '0')));

      const statsRows: OperadorStatsRow[] = rows.map((r) => ({
        cantidad_disponible: r.cantidadDisponible ? Number(r.cantidadDisponible) : 0,
        fecha_vencimiento: r.fechaVencimiento,
      }));

      return { success: true, data: calculateOperadorStats(statsRows) };
    } catch (error) {
      logger.error('Excepción obteniendo estadísticas', error);
      return { success: false, error: 'Error inesperado al cargar estadísticas', errorDetails: error };
    }
  };

  const fetchDepositos = async (): Promise<ServiceResult<Deposito[]>> => {
    try {
      const rows = await tx
        .select({ idDeposito: depositos.idDeposito, nombre: depositos.nombre, descripcion: depositos.descripcion })
        .from(depositos)
        .where(eq(depositos.activo, true))
        .orderBy(depositos.nombre);

      return { success: true, data: rows.map((r) => ({ id_deposito: r.idDeposito, nombre: r.nombre, descripcion: r.descripcion })) };
    } catch (error) {
      logger.error('Excepción obteniendo depósitos', error);
      return { success: false, error: 'Error inesperado al cargar depósitos', errorDetails: error };
    }
  };

  const fetchAlertas = async (): Promise<ServiceResult<AlertaInventario[]>> => {
    try {
      const inventarioResult = await fetchInventario();
      if (!inventarioResult.success || !inventarioResult.data) {
        return { success: false, error: 'No se pudo obtener datos de inventario para alertas' };
      }
      return { success: true, data: generateAlertas(inventarioResult.data) };
    } catch (error) {
      logger.error('Excepción obteniendo alertas', error);
      return { success: false, error: 'Error inesperado al cargar alertas', errorDetails: error };
    }
  };

  const updateCantidad = async (idEntrada: string, nuevaCantidad: number): Promise<ServiceResult<void>> => {
    try {
      logger.info('Actualizando cantidad de entrada', { idEntrada, nuevaCantidad });

      const parsedIdEntrada = parseUuidValue(idEntrada, { name: 'idEntrada' });
      if (!parsedIdEntrada.success) {
        return { success: false, error: parsedIdEntrada.error };
      }

      const cantidad = parseFiniteNumberValue(nuevaCantidad, { name: 'nuevaCantidad', min: 0 });
      if (!cantidad.success) {
        return { success: false, error: cantidad.error };
      }

      const [itemActual] = await tx
        .select({
          idEntrada: entradasInventario.idEntrada,
          idDeposito: entradasInventario.idDeposito,
          idProducto: entradasInventario.idProducto,
          cantidadDisponible: entradasInventario.cantidadDisponible,
          productoNombre: productosDonados.nombreProducto,
          productoUnidadId: productosDonados.unidadId,
        })
        .from(entradasInventario)
        .innerJoin(productosDonados, eq(entradasInventario.idProducto, productosDonados.idProducto))
        .where(eq(entradasInventario.idEntrada, parsedIdEntrada.value))
        .limit(1);

      if (!itemActual) {
        return { success: false, error: 'No se pudo obtener la información del inventario' };
      }

      const cantidadAnterior = itemActual.cantidadDisponible ? Number(itemActual.cantidadDisponible) : 0;
      const diferencia = cantidad.value - cantidadAnterior;

      if (diferencia === 0) {
        return { success: true, data: undefined };
      }

      try {
        await tx
          .update(entradasInventario)
          .set({
            cantidadDisponible: String(cantidad.value),
            estado: cantidad.value === 0 ? 'agotado' : 'disponible',
            updatedAt: new Date(),
            ...(diferencia > 0 ? { cantidadOriginal: String(cantidad.value) } : {}),
          })
          .where(eq(entradasInventario.idEntrada, parsedIdEntrada.value));
      } catch (error) {
        logger.error('Error actualizando cantidad', error);
        return { success: false, error: 'Error al actualizar la cantidad', errorDetails: error };
      }

      const movimientoResult = await registrarMovimientoOperador(itemActual, diferencia, cantidad.value);

      if (!movimientoResult.success) {
        await tx
          .update(entradasInventario)
          .set({ cantidadDisponible: String(cantidadAnterior), estado: cantidadAnterior === 0 ? 'agotado' : 'disponible', updatedAt: new Date() })
          .where(eq(entradasInventario.idEntrada, parsedIdEntrada.value));

        logger.error('Movimiento no registrado, cambios revertidos');
        return { success: false, error: 'No se pudo registrar el movimiento. Los cambios fueron revertidos.', errorDetails: movimientoResult.errorDetails };
      }

      logger.info('Cantidad actualizada exitosamente', { idEntrada: parsedIdEntrada.value, nuevaCantidad: cantidad.value });
      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Excepción actualizando cantidad', error);
      return { success: false, error: 'Error inesperado al actualizar cantidad', errorDetails: error };
    }
  };

  const registrarMovimientoOperador = async (
    item: { idEntrada: string; idDeposito: string; idProducto: string; productoNombre: string | null; productoUnidadId: number | null },
    diferencia: number,
    cantidadNueva: number,
  ): Promise<ServiceResult<void>> => {
    try {
      const parsedOperadorId = parseUuidValue(actorUserId, { name: 'operadorId' });
      if (!parsedOperadorId.success) {
        return { success: false, error: parsedOperadorId.error };
      }

      if (!isUuid(item.idProducto)) {
        return { success: false, error: 'id_producto inválido' };
      }

      const nombreProducto = item.productoNombre || 'Producto';
      if (!item.productoUnidadId) {
        return { success: false, error: 'El producto no tiene una unidad configurada' };
      }

      const tipoTransaccion = diferencia > 0 ? 'ingreso' : 'egreso';
      const cantidadMovimiento = Math.abs(diferencia);

      const [cabecera] = await tx
        .insert(movimientoInventarioCabecera)
        .values({
          fechaMovimiento: new Date(),
          idDonante: parsedOperadorId.value,
          idSolicitante: parsedOperadorId.value,
          estadoMovimiento: 'completado',
          observaciones: `Ajuste manual de inventario por operador - ${nombreProducto} (${diferencia > 0 ? '+' : ''}${diferencia} unidades)`,
        })
        .returning({ idMovimiento: movimientoInventarioCabecera.idMovimiento });

      if (!cabecera) {
        return { success: false, error: 'No se pudo crear el registro del movimiento' };
      }

      try {
        await tx.insert(movimientoInventarioDetalle).values({
          idMovimiento: cabecera.idMovimiento,
          idProducto: item.idProducto,
          cantidad: String(cantidadMovimiento),
          tipoTransaccion,
          rolUsuario: 'distribuidor',
          observacionDetalle: `Ajuste manual de inventario por operador - ${tipoTransaccion === 'ingreso' ? 'Incremento' : 'Reducción'} de ${cantidadMovimiento} unidades. Stock actualizado a ${cantidadNueva}`,
          unidadId: item.productoUnidadId,
          unidadConvertidaId: item.productoUnidadId,
          idEntrada: item.idEntrada,
          idDeposito: item.idDeposito,
        });
      } catch (error) {
        logger.error('Error creando detalle del movimiento', error);
        return { success: false, error: 'No se pudo registrar el detalle del movimiento', errorDetails: error };
      }

      logger.info('Movimiento registrado exitosamente', { movimiento: cabecera.idMovimiento, tipo: tipoTransaccion, cantidad: cantidadMovimiento });
      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Excepción registrando movimiento', error);
      return { success: false, error: 'Error inesperado al registrar el movimiento', errorDetails: error };
    }
  };

  return { fetchInventario, fetchProductosConAlertas, fetchOperadorStats, fetchDepositos, fetchAlertas, updateCantidad };
};

const mapInventarioRowToDomain = (row: InventarioSelectRow): InventarioItem => {
  const cantidad = row.cantidadDisponible ? Number(row.cantidadDisponible) : 0;
  const fechaCaducidad = row.fechaVencimiento;
  const diasParaVencer = fechaCaducidad ? getDiasParaVencer(fechaCaducidad) : null;

  const stockStatus = getStockStatus(cantidad);
  const estadoCaducidad = getEstadoCaducidad(diasParaVencer);
  const necesitaAtencion = stockStatus === 'bajo' || estadoCaducidad === 'proximo' || estadoCaducidad === 'vencido';

  return {
    id_entrada: row.idEntrada,
    id_deposito: row.depositoId,
    id_producto: row.idProducto,
    cantidad_disponible: cantidad,
    fecha_actualizacion: row.updatedAt?.toISOString() ?? row.fechaIngreso?.toISOString() ?? null,
    deposito: { id_deposito: row.depositoId, nombre: row.depositoNombre ?? 'Sin depósito', descripcion: row.depositoDescripcion },
    producto: {
      id_producto: row.productoId,
      nombre_producto: row.productoNombre ?? 'Sin nombre',
      descripcion: row.productoDescripcion,
      categoria: row.productoCategoria,
      unidad_id: row.unidadId ?? row.productoUnidadId,
      unidad_nombre: row.productoUnidadNombre,
      unidad_simbolo: row.productoUnidadSimbolo,
      fecha_caducidad: row.fechaVencimiento,
      fecha_donacion: row.fechaIngreso?.toISOString() ?? null,
      dias_para_vencer: diasParaVencer ?? undefined,
      estado_caducidad: estadoCaducidad,
    },
    necesita_atencion: necesitaAtencion,
    stock_status: stockStatus,
  };
};

const getDiasParaVencer = (fechaCaducidad: string): number => {
  const hoy = new Date();
  const fechaVence = new Date(fechaCaducidad);
  const diferencia = fechaVence.getTime() - hoy.getTime();
  return Math.ceil(diferencia / (1000 * 3600 * 24));
};

const getStockStatus = (cantidad: number): 'bajo' | 'normal' | 'alto' => {
  if (cantidad < STOCK_LEVELS.BAJO) return 'bajo';
  if (cantidad >= STOCK_LEVELS.ALTO) return 'alto';
  return 'normal';
};

const getEstadoCaducidad = (diasParaVencer: number | null): 'vigente' | 'proximo' | 'vencido' => {
  if (diasParaVencer === null) return 'vigente';
  if (diasParaVencer < 0) return 'vencido';
  if (diasParaVencer <= DAYS_TO_EXPIRE.CRITICO) return 'proximo';
  return 'vigente';
};

const calculateOperadorStats = (data: OperadorStatsRow[]): OperadorInventarioStats => {
  const stats = {
    totalProductos: data.length,
    stockBajo: 0,
    stockNormal: 0,
    stockAlto: 0,
    totalUnidades: 0,
    productosProximosVencer: 0,
    productosVencidos: 0,
    alertasActivas: 0,
  };

  data.forEach((item) => {
    const cantidad = item.cantidad_disponible ?? 0;
    stats.totalUnidades += cantidad;

    if (cantidad < STOCK_LEVELS.BAJO) {
      stats.stockBajo++;
    } else if (cantidad >= STOCK_LEVELS.ALTO) {
      stats.stockAlto++;
    } else {
      stats.stockNormal++;
    }

    const fechaCaducidad = item.fecha_vencimiento;
    if (fechaCaducidad) {
      const diasParaVencer = getDiasParaVencer(fechaCaducidad);
      if (diasParaVencer < 0) {
        stats.productosVencidos++;
        stats.alertasActivas++;
      } else if (diasParaVencer <= DAYS_TO_EXPIRE.PROXIMO) {
        stats.productosProximosVencer++;
        stats.alertasActivas++;
      }
    }

    if (cantidad < STOCK_LEVELS.BAJO) {
      stats.alertasActivas++;
    }
  });

  return stats;
};

const generateAlertas = (inventario: InventarioItem[]): AlertaInventario[] => {
  const alertas: AlertaInventario[] = [];

  inventario.forEach((item) => {
    if (item.stock_status === 'bajo') {
      alertas.push({ tipo: 'stock_bajo', producto: item.producto, cantidad_actual: item.cantidad_disponible, deposito: item.deposito, prioridad: item.cantidad_disponible === 0 ? 'alta' : 'media' });
    }

    if (item.producto.estado_caducidad === 'vencido') {
      alertas.push({ tipo: 'vencido', producto: item.producto, cantidad_actual: item.cantidad_disponible, deposito: item.deposito, prioridad: 'alta' });
    } else if (item.producto.estado_caducidad === 'proximo') {
      alertas.push({
        tipo: 'proximo_vencer',
        producto: item.producto,
        cantidad_actual: item.cantidad_disponible,
        deposito: item.deposito,
        prioridad: (item.producto.dias_para_vencer ?? 0) <= DAYS_TO_EXPIRE.CRITICO ? 'alta' : 'media',
      });
    }
  });

  return alertas.sort((a, b) => {
    const prioridadOrder = { alta: 0, media: 1, baja: 2 };
    return prioridadOrder[a.prioridad] - prioridadOrder[b.prioridad];
  });
};
