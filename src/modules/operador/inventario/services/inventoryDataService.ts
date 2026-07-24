/**
 * @fileoverview Servicio de datos de inventario específico para operadores.
 * Incluye funcionalidades y consultas optimizadas para las tareas del operador.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InventarioItem,
  Deposito,
  ServiceResult,
  SupabaseInventarioRow,
  OperadorInventarioStats,
  AlertaInventario
} from '../types';
import {
  isUuid,
  parseFiniteNumberValue,
  parseUuidValue,
} from '@/lib/validation-core';

type OperadorStatsRow = {
  cantidad_disponible: number | null;
  fecha_vencimiento: string | null;
};

type AjusteInventarioRow = {
  id_entrada: string;
  id_deposito: string;
  cantidad_disponible: number | null;
  id_producto: string;
  productos?: {
    nombre_producto?: string | null;
    unidad_id?: number | null;
  } | {
    nombre_producto?: string | null;
    unidad_id?: number | null;
  }[] | null;
};

// Constantes locales
const STOCK_LEVELS = {
  BAJO: 10,
  NORMAL: 50,
  ALTO: 50
} as const;

const DAYS_TO_EXPIRE = {
  PROXIMO: 30,
  CRITICO: 7
} as const;

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = {
  info: (message: string, details?: unknown) => {
    if (isDevelopment) {
      console.info(`[OperadorInventoryService] ${message}`, details);
    }
  },
  error: (message: string, error?: unknown) => console.error(`[OperadorInventoryService] ${message}`, error)
};

export const createOperadorInventoryDataService = (supabaseClient: SupabaseClient) => {
  
  /**
   * Obtener inventario con información enriquecida para operadores
   */
  const fetchInventario = async (): Promise<ServiceResult<InventarioItem[]>> => {
    try {
      logger.info('Consultando inventario para operador');
      
      const { data, error } = await supabaseClient
        .from('entradas_inventario')
        .select(`
          id_entrada,
          id_deposito,
          id_producto,
          unidad_id,
          cantidad_disponible,
          fecha_ingreso,
          fecha_vencimiento,
          updated_at,
          depositos!inner(
            id_deposito,
            nombre,
            descripcion
          ),
          productos:productos_donados!inner(
            id_producto,
            id_usuario,
            nombre_producto,
            descripcion,
            unidad_id,
            unidades:unidades(
              id,
              nombre,
              simbolo
            )
          )
        `)
        .eq('estado', 'disponible')
        .gt('cantidad_disponible', 0)
        .order('updated_at', { ascending: false });

      if (error) {
        logger.error('Error consultando inventario', error);
        return {
          success: false,
          error: 'Error al cargar el inventario',
          errorDetails: error
        };
      }

      if (!data) {
        logger.info('No se encontraron datos de inventario');
        return {
          success: true,
          data: []
        };
      }

      logger.info('Datos de inventario recibidos', { count: data.length });

      const inventarioRows = (data ?? []) as SupabaseInventarioRow[];
      const donorDepositsByDonorId = await fetchDonorDepositsByDonorId(supabaseClient, inventarioRows);
      const mappedData = inventarioRows.map(row => mapInventarioRowToDomainWithOperatorInfo(row, donorDepositsByDonorId));
      logger.info('Datos mapeados correctamente', { count: mappedData.length });
      
      return {
        success: true,
        data: mappedData
      };
    } catch (error) {
      logger.error('Excepción obteniendo inventario', error);
      return {
        success: false,
        error: 'Error inesperado al cargar inventario',
        errorDetails: error
      };
    }
  };

  /**
   * Obtener solo productos que necesitan atención del operador
   */
  const fetchProductosConAlertas = async (): Promise<ServiceResult<InventarioItem[]>> => {
    try {
      const { data, error } = await supabaseClient
        .from('entradas_inventario')
        .select(`
          id_entrada,
          id_deposito,
          id_producto,
          unidad_id,
          cantidad_disponible,
          fecha_ingreso,
          fecha_vencimiento,
          updated_at,
          depositos!inner(
            id_deposito,
            nombre,
            descripcion
          ),
          productos:productos_donados!inner(
            id_producto,
            id_usuario,
            nombre_producto,
            descripcion,
            unidad_id,
            unidades:unidades(
              id,
              nombre,
              simbolo
            )
          )
        `)
        .eq('estado', 'disponible')
        .or(`cantidad_disponible.lt.${STOCK_LEVELS.BAJO}`)
        .order('cantidad_disponible', { ascending: true });

      if (error) {
        logger.error('Error consultando productos con alertas', error);
        return {
          success: false,
          error: 'Error al cargar productos con alertas',
          errorDetails: error
        };
      }

      const inventarioRows = (data ?? []) as SupabaseInventarioRow[];
      const donorDepositsByDonorId = await fetchDonorDepositsByDonorId(supabaseClient, inventarioRows);
      const inventario = inventarioRows
        .map(row => mapInventarioRowToDomainWithOperatorInfo(row, donorDepositsByDonorId))
        .filter(item => item.necesita_atencion);

      return {
        success: true,
        data: inventario
      };
    } catch (error) {
      logger.error('Excepción obteniendo productos con alertas', error);
      return {
        success: false,
        error: 'Error inesperado al cargar productos con alertas',
        errorDetails: error
      };
    }
  };

  /**
   * Obtener estadísticas específicas para operador
   */
  const fetchOperadorStats = async (): Promise<ServiceResult<OperadorInventarioStats>> => {
    try {
      const { data, error } = await supabaseClient
        .from('entradas_inventario')
        .select('cantidad_disponible, fecha_vencimiento')
        .eq('estado', 'disponible')
        .gt('cantidad_disponible', 0);

      if (error) {
        logger.error('Error consultando estadísticas', error);
        return {
          success: false,
          error: 'Error al cargar estadísticas',
          errorDetails: error
        };
      }

      const stats = calculateOperadorStats((data ?? []) as OperadorStatsRow[]);

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      logger.error('Excepción obteniendo estadísticas', error);
      return {
        success: false,
        error: 'Error inesperado al cargar estadísticas',
        errorDetails: error
      };
    }
  };

  /**
   * Obtener depósitos
   */
  const fetchDepositos = async (): Promise<ServiceResult<Deposito[]>> => {
    try {
      const { data, error } = await supabaseClient
        .from('depositos')
        .select('id_deposito, nombre, descripcion')
        .eq('activo', true)
        .order('nombre', { ascending: true });

      if (error) {
        logger.error('Error consultando depósitos', error);
        return {
          success: false,
          error: 'Error al cargar los depósitos',
          errorDetails: error
        };
      }

      const depositos = await applyDonorDisplayNamesToDepositos(supabaseClient, data || []);

      return {
        success: true,
        data: depositos
      };
    } catch (error) {
      logger.error('Excepción obteniendo depósitos', error);
      return {
        success: false,
        error: 'Error inesperado al cargar depósitos',
        errorDetails: error
      };
    }
  };

  /**
   * Obtener alertas activas
   */
  const fetchAlertas = async (): Promise<ServiceResult<AlertaInventario[]>> => {
    try {
      const inventarioResult = await fetchInventario();
      if (!inventarioResult.success || !inventarioResult.data) {
        return {
          success: false,
          error: 'No se pudo obtener datos de inventario para alertas'
        };
      }

      const alertas = generateAlertas(inventarioResult.data);

      return {
        success: true,
        data: alertas
      };
    } catch (error) {
      logger.error('Excepción obteniendo alertas', error);
      return {
        success: false,
        error: 'Error inesperado al cargar alertas',
        errorDetails: error
      };
    }
  };

  /**
   * Actualizar cantidad de un item de inventario
   */
  const updateCantidad = async (
    idEntrada: string,
    nuevaCantidad: number
  ): Promise<ServiceResult<void>> => {
    try {
      logger.info('Actualizando cantidad de entrada', { idEntrada, nuevaCantidad });

      const parsedIdEntrada = parseUuidValue(idEntrada, { name: 'idEntrada' });
      if (!parsedIdEntrada.success) {
        return {
          success: false,
          error: parsedIdEntrada.error
        };
      }

      const cantidad = parseFiniteNumberValue(nuevaCantidad, {
        name: 'nuevaCantidad',
        min: 0
      });
      if (!cantidad.success) {
        return {
          success: false,
          error: cantidad.error
        };
      }

      // Obtener el item actual para calcular la diferencia
      const { data: itemActual, error: fetchError } = await supabaseClient
        .from('entradas_inventario')
        .select(`
          id_entrada,
          id_deposito,
          cantidad_disponible,
          id_producto,
          productos:productos_donados!inner(
            nombre_producto,
            unidad_id
          )
        `)
        .eq('id_entrada', parsedIdEntrada.value)
        .single();

      if (fetchError || !itemActual) {
        logger.error('Error obteniendo item actual', fetchError);
        return {
          success: false,
          error: 'No se pudo obtener la información del inventario',
          errorDetails: fetchError
        };
      }

      const cantidadAnterior = itemActual.cantidad_disponible ?? 0;
      const diferencia = cantidad.value - cantidadAnterior;

      if (diferencia === 0) {
        return {
          success: true,
          data: undefined
        };
      }

      const updateData: Record<string, unknown> = {
        cantidad_disponible: cantidad.value,
        estado: cantidad.value === 0 ? 'agotado' : 'disponible',
        updated_at: new Date().toISOString(),
      };
      if (diferencia > 0) updateData.cantidad_original = cantidad.value;

      let updateQuery = supabaseClient
        .from('entradas_inventario')
        .update(updateData)
        .eq('id_entrada', parsedIdEntrada.value);
      if (diferencia < 0) {
        updateQuery = updateQuery.gte('cantidad_disponible', Math.abs(diferencia));
      }
      const { error } = await updateQuery;

      if (error) {
        logger.error('Error actualizando cantidad', error);
        return {
          success: false,
          error: 'Error al actualizar la cantidad',
          errorDetails: error
        };
      }

      // Registrar el movimiento con el operador como responsable
      const movimientoResult = await registrarMovimientoOperador(
        itemActual,
        diferencia,
        cantidad.value
      );

      if (!movimientoResult.success) {
        // Si falla el registro del movimiento, revertir el cambio
        await supabaseClient
          .from('entradas_inventario')
          .update({
            cantidad_disponible: cantidadAnterior,
            estado: cantidadAnterior === 0 ? 'agotado' : 'disponible',
            updated_at: new Date().toISOString(),
          })
          .eq('id_entrada', parsedIdEntrada.value);

        logger.error('Movimiento no registrado, cambios revertidos');
        return {
          success: false,
          error: 'No se pudo registrar el movimiento. Los cambios fueron revertidos.',
          errorDetails: movimientoResult.errorDetails
        };
      }

      logger.info('Cantidad actualizada exitosamente', { idEntrada: parsedIdEntrada.value, nuevaCantidad: cantidad.value });

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      logger.error('Excepción actualizando cantidad', error);
      return {
        success: false,
        error: 'Error inesperado al actualizar cantidad',
        errorDetails: error
      };
    }
  };

  /**
   * Registrar movimiento de ajuste realizado por operador
   */
  const registrarMovimientoOperador = async (
    item: AjusteInventarioRow,
    diferencia: number,
    cantidadNueva: number
  ): Promise<ServiceResult<void>> => {
    try {
      const { data: auth, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !auth?.user) {
        logger.error('No se pudo obtener el usuario autenticado', authError);
        return {
          success: false,
          error: 'No se pudo identificar al usuario operador',
          errorDetails: authError
        };
      }

      const operadorId = auth.user.id;
      const parsedOperadorId = parseUuidValue(operadorId, { name: 'operadorId' });
      if (!parsedOperadorId.success) {
        return {
          success: false,
          error: parsedOperadorId.error
        };
      }

      const producto = normalizeRelation(item.productos);
      if (!isUuid(item.id_producto)) {
        return {
          success: false,
          error: 'id_producto inválido'
        };
      }

      const nombreProducto = producto?.nombre_producto || 'Producto';
      if (!producto?.unidad_id) {
        return {
          success: false,
          error: 'El producto no tiene una unidad configurada'
        };
      }

      const tipoTransaccion = diferencia > 0 ? 'ingreso' : 'egreso';
      const cantidadMovimiento = Math.abs(diferencia);

      // Crear cabecera del movimiento con el operador como responsable
      const { data: cabecera, error: cabeceraError } = await supabaseClient
        .from('movimiento_inventario_cabecera')
        .insert({
          fecha_movimiento: new Date().toISOString(),
          id_donante: parsedOperadorId.value,
          id_solicitante: parsedOperadorId.value,
          estado_movimiento: 'completado',
          observaciones: `Ajuste manual de inventario por operador - ${nombreProducto} (${diferencia > 0 ? '+' : ''}${diferencia} unidades)`
        })
        .select('id_movimiento')
        .single();

      if (cabeceraError || !cabecera) {
        logger.error('Error creando cabecera del movimiento', cabeceraError);
        return {
          success: false,
          error: 'No se pudo crear el registro del movimiento',
          errorDetails: cabeceraError
        };
      }

      // Crear detalle del movimiento
      const { error: detalleError } = await supabaseClient
        .from('movimiento_inventario_detalle')
        .insert({
          id_movimiento: cabecera.id_movimiento,
          id_producto: item.id_producto,
          cantidad: cantidadMovimiento,
          tipo_transaccion: tipoTransaccion,
          rol_usuario: 'distribuidor',
          observacion_detalle: `Ajuste manual de inventario por operador - ${tipoTransaccion === 'ingreso' ? 'Incremento' : 'Reducción'} de ${cantidadMovimiento} unidades. Stock actualizado a ${cantidadNueva}`,
          unidad_id: producto.unidad_id,
          unidad_convertida_id: producto.unidad_id,
          id_entrada: item.id_entrada,
          id_deposito: item.id_deposito,
        });

      if (detalleError) {
        logger.error('Error creando detalle del movimiento', detalleError);
        return {
          success: false,
          error: 'No se pudo registrar el detalle del movimiento',
          errorDetails: detalleError
        };
      }

      logger.info('Movimiento registrado exitosamente', { 
        movimiento: cabecera.id_movimiento,
        tipo: tipoTransaccion,
        cantidad: cantidadMovimiento
      });

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      logger.error('Excepción registrando movimiento', error);
      return {
        success: false,
        error: 'Error inesperado al registrar el movimiento',
        errorDetails: error
      };
    }
  };

  return {
    fetchInventario,
    fetchProductosConAlertas,
    fetchOperadorStats,
    fetchDepositos,
    fetchAlertas,
    updateCantidad
  };
};

// Utility functions
const normalizeRelation = <T>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }
  return (value ?? null) as T | null;
};

type SupabaseDonanteDepositoRow = {
  donante_id?: string | null;
  depositos?: {
    id_deposito?: string | null;
    nombre?: string | null;
    descripcion?: string | null;
  } | {
    id_deposito?: string | null;
    nombre?: string | null;
    descripcion?: string | null;
  }[] | null;
};

type SupabaseUsuarioDonanteRow = {
  id?: string | null;
  nombre?: string | null;
};

const applyDonorDisplayNamesToDepositos = async (
  supabaseClient: SupabaseClient,
  depositos: Deposito[]
): Promise<Deposito[]> => {
  if (depositos.length === 0) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from('donante_depositos')
    .select(`
      donante_id,
      depositos:depositos!donante_depositos_id_deposito_fkey(
        id_deposito,
        nombre,
        descripcion
      )
    `)
    .eq('activo', true)
    .order('es_principal', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('Error consultando depósitos por donante para filtros', error);
    return depositos;
  }

  const donorIds = Array.from(new Set(
    ((data ?? []) as SupabaseDonanteDepositoRow[])
      .map(row => row.donante_id)
      .filter((id): id is string => Boolean(id) && isUuid(id))
  ));

  if (donorIds.length === 0) {
    return depositos;
  }

  const donorNamesResponse = await supabaseClient
    .from('usuarios')
    .select('id, nombre')
    .in('id', donorIds);

  const donorNamesById = new Map<string, string>();
  if (donorNamesResponse.error) {
    logger.error('Error consultando nombres de donantes para filtros', donorNamesResponse.error);
  } else {
    for (const donorRow of ((donorNamesResponse.data ?? []) as SupabaseUsuarioDonanteRow[])) {
      const donorId = donorRow.id ?? null;
      const donorName = donorRow.nombre?.trim() ?? '';

      if (!donorId || donorName.length === 0) {
        continue;
      }

      donorNamesById.set(donorId, donorName);
    }
  }

  const donorDepositNamesById = new Map<string, Deposito>();

  for (const row of ((data ?? []) as SupabaseDonanteDepositoRow[])) {
    const donorId = row.donante_id ?? null;
    const deposito = normalizeRelation(row.depositos);

    if (!donorId || !deposito?.id_deposito || donorDepositNamesById.has(deposito.id_deposito)) {
      continue;
    }

    const donorName = donorNamesById.get(donorId);
    const displayName = donorName
      ? `Depósito de ${donorName}`
      : (deposito.nombre ?? 'Sin depósito');

    donorDepositNamesById.set(deposito.id_deposito, {
      id_deposito: deposito.id_deposito,
      nombre: displayName,
      descripcion: deposito.descripcion ?? null
    });
  }

  return depositos.map(deposito => donorDepositNamesById.get(deposito.id_deposito) ?? deposito);
};

const fetchDonorDepositsByDonorId = async (
  supabaseClient: SupabaseClient,
  inventarioRows: SupabaseInventarioRow[]
): Promise<Map<string, Deposito>> => {
  const donorIds = Array.from(new Set(
    inventarioRows
      .map(row => normalizeRelation(row.productos)?.id_usuario)
      .filter((id): id is string => Boolean(id) && isUuid(id))
  ));

  if (donorIds.length === 0) {
    return new Map<string, Deposito>();
  }

  const donorNamesResponse = await supabaseClient
    .from('usuarios')
    .select('id, nombre')
    .in('id', donorIds);

  const donorNamesById = new Map<string, string>();
  if (donorNamesResponse.error) {
    logger.error('Error consultando nombres de donantes', donorNamesResponse.error);
  } else {
    for (const donorRow of ((donorNamesResponse.data ?? []) as SupabaseUsuarioDonanteRow[])) {
      const donorId = donorRow.id ?? null;
      const donorName = donorRow.nombre?.trim() ?? '';

      if (!donorId || donorName.length === 0) {
        continue;
      }

      donorNamesById.set(donorId, donorName);
    }
  }

  const { data, error } = await supabaseClient
    .from('donante_depositos')
    .select(`
      donante_id,
      depositos:depositos!donante_depositos_id_deposito_fkey(
        id_deposito,
        nombre,
        descripcion
      )
    `)
    .in('donante_id', donorIds)
    .eq('activo', true)
    .order('es_principal', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('Error consultando depósitos por donante', error);
    return new Map<string, Deposito>();
  }

  const donorDepositMap = new Map<string, Deposito>();

  for (const row of ((data ?? []) as SupabaseDonanteDepositoRow[])) {
    const donorId = row.donante_id ?? null;
    const deposito = normalizeRelation(row.depositos);

    if (!donorId || !deposito?.id_deposito || donorDepositMap.has(donorId)) {
      continue;
    }

    const donorName = donorNamesById.get(donorId);
    const displayDepositName = donorName
      ? `Depósito de ${donorName}`
      : (deposito.nombre ?? 'Sin depósito');

    donorDepositMap.set(donorId, {
      id_deposito: deposito.id_deposito,
      nombre: displayDepositName,
      descripcion: deposito.descripcion ?? null
    });
  }

  return donorDepositMap;
};

const mapInventarioRowToDomainWithOperatorInfo = (
  row: SupabaseInventarioRow,
  donorDepositsByDonorId: Map<string, Deposito>
): InventarioItem => {
  const deposito = normalizeRelation(row.depositos);
  const producto = normalizeRelation(row.productos);
  const donorId = producto?.id_usuario ?? null;
  const donorDeposit = donorId ? donorDepositsByDonorId.get(donorId) : undefined;

  // Calcular información específica para operador
  const cantidad = row.cantidad_disponible ?? 0;
  const fechaCaducidad = row.fecha_vencimiento;
  const diasParaVencer = fechaCaducidad ? getDiasParaVencer(fechaCaducidad) : null;
  
  const stockStatus = getStockStatus(cantidad);
  const estadoCaducidad = getEstadoCaducidad(diasParaVencer);
  const necesitaAtencion = stockStatus === 'bajo' || estadoCaducidad === 'proximo' || estadoCaducidad === 'vencido';

  // Obtener información de unidad estructurada
  const unidadInfo = producto?.unidades;
  const unidadNombre = Array.isArray(unidadInfo) ? unidadInfo[0]?.nombre : unidadInfo?.nombre;
  const unidadSimbolo = Array.isArray(unidadInfo) ? unidadInfo[0]?.simbolo : unidadInfo?.simbolo;

  return {
    id_entrada: row.id_entrada,
    id_deposito: row.id_deposito,
    id_producto: row.id_producto,
    cantidad_disponible: cantidad,
    fecha_actualizacion: row.updated_at ?? row.fecha_ingreso ?? null,
    deposito: {
      id_deposito: donorDeposit?.id_deposito ?? deposito?.id_deposito ?? row.id_deposito,
      nombre: donorDeposit?.nombre ?? deposito?.nombre ?? 'Sin depósito',
      descripcion: donorDeposit?.descripcion ?? deposito?.descripcion ?? null
    },
    producto: {
      id_producto: producto?.id_producto ?? row.id_producto,
      nombre_producto: producto?.nombre_producto ?? 'Sin nombre',
      descripcion: producto?.descripcion ?? null,
      unidad_id: row.unidad_id ?? producto?.unidad_id ?? null,
      unidad_nombre: unidadNombre ?? null,
      unidad_simbolo: unidadSimbolo ?? null,
      fecha_caducidad: row.fecha_vencimiento ?? null,
      fecha_donacion: row.fecha_ingreso ?? null,
      dias_para_vencer: diasParaVencer ?? undefined,
      estado_caducidad: estadoCaducidad
    },
    necesita_atencion: necesitaAtencion,
    stock_status: stockStatus
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
    alertasActivas: 0
  };

  data.forEach(item => {
    const cantidad = item.cantidad_disponible ?? 0;
    stats.totalUnidades += cantidad;

    // Stock levels
    if (cantidad < STOCK_LEVELS.BAJO) {
      stats.stockBajo++;
    } else if (cantidad >= STOCK_LEVELS.ALTO) {
      stats.stockAlto++;
    } else {
      stats.stockNormal++;
    }

    // Productos próximos a vencer o vencidos
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

    // Alertas por stock bajo
    if (cantidad < STOCK_LEVELS.BAJO) {
      stats.alertasActivas++;
    }
  });

  return stats;
};

const generateAlertas = (inventario: InventarioItem[]): AlertaInventario[] => {
  const alertas: AlertaInventario[] = [];

  inventario.forEach(item => {
    // Alerta por stock bajo
    if (item.stock_status === 'bajo') {
      alertas.push({
        tipo: 'stock_bajo',
        producto: item.producto,
        cantidad_actual: item.cantidad_disponible,
        deposito: item.deposito,
        prioridad: item.cantidad_disponible === 0 ? 'alta' : 'media'
      });
    }

    // Alertas por caducidad
    if (item.producto.estado_caducidad === 'vencido') {
      alertas.push({
        tipo: 'vencido',
        producto: item.producto,
        cantidad_actual: item.cantidad_disponible,
        deposito: item.deposito,
        prioridad: 'alta'
      });
    } else if (item.producto.estado_caducidad === 'proximo') {
      alertas.push({
        tipo: 'proximo_vencer',
        producto: item.producto,
        cantidad_actual: item.cantidad_disponible,
        deposito: item.deposito,
        prioridad: item.producto.dias_para_vencer! <= DAYS_TO_EXPIRE.CRITICO ? 'alta' : 'media'
      });
    }
  });

  return alertas.sort((a, b) => {
    const prioridadOrder = { alta: 0, media: 1, baja: 2 };
    return prioridadOrder[a.prioridad] - prioridadOrder[b.prioridad];
  });
};
