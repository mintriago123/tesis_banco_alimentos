/**
 * @fileoverview API para gestionar bajas de productos
 * Endpoints para registrar bajas, consultar historial y obtener estadísticas
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { requireRole } from '@/lib/server-auth';
import {
  parseEnumParam,
  parseIsoDateParam,
  parseOptionalText,
  parsePaginationParams,
  parsePositiveNumber,
  parseUuid,
  readJsonObject,
} from '@/lib/api-validation';
import { validateCsrfRequest } from '@/lib/csrf';

export const dynamic = 'force-dynamic';

const MOTIVOS_BAJA = ['vencido', 'dañado', 'contaminado', 'rechazado', 'otro'] as const;
const MOTIVOS_BAJA_FILTRO = ['todos', ...MOTIVOS_BAJA] as const;

/**
 * POST /api/operador/bajas
 * Registra una nueva baja de producto
 */
export async function POST(request: NextRequest) {
  try {
    const csrfResponse = validateCsrfRequest(request);
    if (csrfResponse) {
      return csrfResponse;
    }

    const supabase = await createServerSupabaseClient();
    const authResult = await requireRole(supabase, ['ADMINISTRADOR', 'OPERADOR']);

    if (authResult.response) {
      return authResult.response;
    }

    // Obtener y validar datos del request
    const jsonBody = await readJsonObject(request);
    if (!jsonBody.success) return jsonBody.response;

    const idEntrada = parseUuid(jsonBody.value.id_entrada, { name: 'id_entrada' });
    if (!idEntrada.success) return idEntrada.response;

    const cantidad = parsePositiveNumber(jsonBody.value.cantidad, { name: 'cantidad' });
    if (!cantidad.success) return cantidad.response;

    const motivo = parseEnumParam(jsonBody.value.motivo, MOTIVOS_BAJA, { name: 'motivo' });
    if (!motivo.success) return motivo.response;

    const observaciones = parseOptionalText(jsonBody.value.observaciones, {
      name: 'observaciones',
      maxLength: 500,
    });
    if (!observaciones.success) return observaciones.response;

    const adminSupabase = createAdminSupabaseClient();

    // Llamar a la función de base de datos desde el servidor tras validar rol.
    const rpcParams = {
      p_id_entrada: idEntrada.value,
      p_cantidad: cantidad.value,
      p_motivo: motivo.value,
      p_usuario_id: authResult.user.id,
      p_observaciones: observaciones.value,
    };

    const { data, error } = await adminSupabase
      .rpc('dar_baja_producto', {
        ...rpcParams,
      });

    if (error) {
      console.error('Error al dar de baja producto:', error);
      return NextResponse.json(
        { error: 'Error al procesar la baja del producto', details: error.message },
        { status: 500 }
      );
    }

    // La función retorna un array con un objeto
    const resultado = data?.[0];
    
    if (!resultado?.success) {
      return NextResponse.json(
        { error: resultado?.message || 'No se pudo completar la baja' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: resultado.message,
      data: {
        id_baja: resultado.id_baja,
        cantidad_restante: resultado.cantidad_restante
      }
    });

  } catch (error) {
    console.error('Error en POST /api/operador/bajas:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/operador/bajas
 * Obtiene el historial de bajas con filtros opcionales
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const authResult = await requireRole(supabase, ['ADMINISTRADOR', 'OPERADOR']);

    if (authResult.response) {
      return authResult.response;
    }

    // Obtener parámetros de búsqueda
    const searchParams = request.nextUrl.searchParams;
    const motivo = parseEnumParam(searchParams.get('motivo'), MOTIVOS_BAJA_FILTRO, {
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
      defaultLimit: 100,
      maxLimit: 200,
    });
    if (!pagination.success) return pagination.response;

    const { limit, offset } = pagination.value;

    // Construir query
    let query = supabase
      .from('v_bajas_productos_detalle')
      .select('*', { count: 'exact' })
      .order('fecha_baja', { ascending: false })
      .range(offset, offset + limit - 1);

    // Aplicar filtros
    if (motivo.value !== 'todos') {
      query = query.eq('motivo_baja', motivo.value);
    }

    if (fechaInicio.value) {
      query = query.gte('fecha_baja', fechaInicio.value);
    }

    if (fechaFin.value) {
      query = query.lte('fecha_baja', fechaFin.value);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error al obtener bajas:', error);
      return NextResponse.json(
        { error: 'Error al consultar bajas' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: count ? count > offset + limit : false
      }
    });

  } catch (error) {
    console.error('Error en GET /api/operador/bajas:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
