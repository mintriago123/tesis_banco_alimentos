/**
 * @fileoverview API para consultar historial de cancelaciones de donaciones
 * Endpoint para obtener cancelaciones con filtros y estadísticas
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { DonacionCanceladaDetalle, EstadisticasCancelaciones } from '@/modules/admin/reportes/cancelaciones/types';
import {
  parseBooleanParam,
  parseEnumParam,
  parseIsoDateParam,
  parsePaginationParams,
} from '@/lib/api-validation';
import { isUuid } from '@/lib/validation-core';

export const dynamic = 'force-dynamic';

const MOTIVOS_CANCELACION_FILTRO = [
  'todos',
  'error_donante',
  'no_disponible',
  'calidad_inadecuada',
  'logistica_imposible',
  'duplicado',
  'solicitud_donante',
  'otro',
] as const;

/**
 * GET /api/admin/cancelaciones-donaciones
 * Obtiene el historial de donaciones canceladas con filtros opcionales
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Verificar autenticación
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    // Verificar rol de administrador
    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('rol, estado')
      .eq('id', user.id)
      .single();

    if (usuarioError || !usuario) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    if (usuario.rol !== 'ADMINISTRADOR') {
      return NextResponse.json(
        { error: 'No tienes permisos para acceder a este recurso' },
        { status: 403 }
      );
    }

    // Obtener parámetros de consulta
    const searchParams = request.nextUrl.searchParams;
    const motivo = parseEnumParam(searchParams.get('motivo'), MOTIVOS_CANCELACION_FILTRO, {
      name: 'motivo',
      fallback: 'todos',
    });
    if (!motivo.success) return motivo.response;

    const fechaInicio = parseIsoDateParam(searchParams.get('fecha_inicio'), { name: 'fecha_inicio' });
    if (!fechaInicio.success) return fechaInicio.response;

    const fechaFin = parseIsoDateParam(searchParams.get('fecha_fin'), { name: 'fecha_fin' });
    if (!fechaFin.success) return fechaFin.response;

    if (fechaInicio.value && fechaFin.value && new Date(fechaInicio.value) > new Date(fechaFin.value)) {
      return NextResponse.json(
        { error: 'fecha_inicio no puede ser posterior a fecha_fin.' },
        { status: 400 }
      );
    }

    const pagination = parsePaginationParams(searchParams, {
      defaultLimit: 50,
      maxLimit: 200,
    });
    if (!pagination.success) return pagination.response;

    const incluirEstadisticas = parseBooleanParam(searchParams.get('estadisticas'), {
      name: 'estadisticas',
      fallback: false,
    });
    if (!incluirEstadisticas.success) return incluirEstadisticas.response;

    const { limit, offset } = pagination.value;

    // Construir consulta base
    let query = supabase
      .from('donaciones')
      .select(`
        id,
        user_id,
        nombre_donante,
        tipo_producto,
        cantidad,
        unidad_nombre,
        unidad_simbolo,
        estado,
        motivo_cancelacion,
        observaciones_cancelacion,
        usuario_cancelacion_id,
        fecha_cancelacion,
        fecha_disponible,
        creado_en,
        categoria_comida,
        direccion_entrega,
        telefono,
        email,
        impacto_estimado_personas,
        codigo_comprobante
      `, { count: 'exact' })
      .eq('estado', 'Cancelada');

    // Solo filtrar por motivo si existe y no es null
    // Esto permite que funcione incluso si los campos nuevos no existen aún
    if (motivo.value !== 'todos') {
      query = query.eq('motivo_cancelacion', motivo.value);
    }

    if (fechaInicio.value) {
      query = query.gte('fecha_cancelacion', fechaInicio.value);
    }

    if (fechaFin.value) {
      // Agregar un día para incluir todo el día final
      const fechaFinAjustada = new Date(fechaFin.value);
      fechaFinAjustada.setDate(fechaFinAjustada.getDate() + 1);
      query = query.lt('fecha_cancelacion', fechaFinAjustada.toISOString());
    }

    // Ordenar por fecha de cancelación (más recientes primero)
    query = query.order('fecha_cancelacion', { ascending: false });

    // Aplicar paginación
    query = query.range(offset, offset + limit - 1);

    const { data: cancelaciones, error: cancelacionesError, count } = await query;

    if (cancelacionesError) {
      console.error('Error al consultar cancelaciones:', cancelacionesError);
      
      // Si el error es por columnas que no existen, devolver mensaje específico
      if (cancelacionesError.message?.includes('column') || cancelacionesError.code === '42703') {
        return NextResponse.json(
          { 
            error: 'Los campos de cancelación no existen en la base de datos. Por favor, ejecuta el script SQL: database/agregar-campos-cancelacion-donaciones.sql',
            details: cancelacionesError.message
          },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { error: 'Error al obtener el historial de cancelaciones' },
        { status: 500 }
      );
    }

    if (!cancelaciones) {
      return NextResponse.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          offset,
          limit,
          has_more: false
        }
      });
    }

    // Obtener datos de usuarios que cancelaron (filtrar nulls)
    const usuariosCancelacionIds = [...new Set(
      cancelaciones
        .map(c => c.usuario_cancelacion_id)
        .filter((id): id is string => id !== null && id !== undefined && isUuid(id))
    )];
    
    let usuariosCancelacion: Array<{ id: string; nombre: string; email: string; rol: string }> = [];
    
    if (usuariosCancelacionIds.length > 0) {
      const { data, error: usuariosError } = await supabase
        .from('usuarios')
        .select('id, nombre, email, rol')
        .in('id', usuariosCancelacionIds);

      if (usuariosError) {
        console.error('Error al obtener usuarios:', usuariosError);
      } else {
        usuariosCancelacion = data || [];
      }
    }

    // Mapear usuarios por ID
    const usuariosMap = new Map(
      usuariosCancelacion.map(u => [u.id, u])
    );

    // Combinar datos
    const cancelacionesDetalle: DonacionCanceladaDetalle[] = cancelaciones.map(cancelacion => ({
      ...cancelacion,
      usuario_cancelacion_nombre: cancelacion.usuario_cancelacion_id 
        ? (usuariosMap.get(cancelacion.usuario_cancelacion_id)?.nombre || 'Desconocido')
        : 'Sistema',
      usuario_cancelacion_email: cancelacion.usuario_cancelacion_id
        ? (usuariosMap.get(cancelacion.usuario_cancelacion_id)?.email || '')
        : '',
      usuario_cancelacion_rol: cancelacion.usuario_cancelacion_id
        ? (usuariosMap.get(cancelacion.usuario_cancelacion_id)?.rol || '')
        : ''
    }));

    // Calcular estadísticas si se solicitan
    let estadisticas: EstadisticasCancelaciones | undefined;

    if (incluirEstadisticas.value) {
      const { data: statsData, error: statsError } = await supabase
        .from('donaciones')
        .select('motivo_cancelacion, cantidad')
        .eq('estado', 'Cancelada')
        .not('motivo_cancelacion', 'is', null);

      if (!statsError && statsData) {
        const stats = {
          total: {
            cancelaciones: statsData.length,
            cantidad_total: statsData.reduce((sum, item) => sum + (item.cantidad || 0), 0)
          },
          por_motivo: {
            error_donante: { cancelaciones: 0, cantidad: 0 },
            no_disponible: { cancelaciones: 0, cantidad: 0 },
            calidad_inadecuada: { cancelaciones: 0, cantidad: 0 },
            logistica_imposible: { cancelaciones: 0, cantidad: 0 },
            duplicado: { cancelaciones: 0, cantidad: 0 },
            solicitud_donante: { cancelaciones: 0, cantidad: 0 },
            otro: { cancelaciones: 0, cantidad: 0 }
          }
        };

        statsData.forEach(item => {
          const motivo = item.motivo_cancelacion as keyof typeof stats.por_motivo;
          if (stats.por_motivo[motivo]) {
            stats.por_motivo[motivo].cancelaciones++;
            stats.por_motivo[motivo].cantidad += item.cantidad || 0;
          }
        });

        estadisticas = stats;
      }
    }

    return NextResponse.json({
      success: true,
      data: cancelacionesDetalle,
      pagination: {
        total: count || 0,
        offset,
        limit,
        has_more: (offset + limit) < (count || 0)
      },
      ...(estadisticas && { estadisticas })
    });

  } catch (error) {
    console.error('Error en GET /api/admin/cancelaciones-donaciones:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
