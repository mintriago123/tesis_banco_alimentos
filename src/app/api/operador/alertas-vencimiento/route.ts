/**
 * @fileoverview API para obtener alertas de productos próximos a vencer o vencidos
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireActiveUserRole } from '@/lib/server-auth';
import {
  parseBooleanParam,
  parseEnumParam,
  parsePositiveIntParam,
} from '@/lib/api-validation';

export const dynamic = 'force-dynamic';

type PrioridadAlerta = 'vencido' | 'alta' | 'media' | 'baja';
const PRIORIDADES_ALERTA_FILTRO = ['todos', 'vencido', 'alta', 'media', 'baja'] as const;

type AlertaVencimientoRpcRow = {
  id_inventario: string;
  id_producto: string;
  nombre_producto: string;
  cantidad_disponible: number | string;
  fecha_caducidad: string;
  dias_para_vencer: number;
  id_deposito: string;
  nombre_deposito: string;
  unidad_simbolo: string | null;
  prioridad: PrioridadAlerta;
};

/**
 * GET /api/operador/alertas-vencimiento
 * Obtiene productos próximos a vencer o vencidos
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const authResult = await requireActiveUserRole(supabase, ['ADMINISTRADOR', 'OPERADOR']);

    if (authResult.response) {
      return authResult.response;
    }

    // Obtener parámetros
    const searchParams = request.nextUrl.searchParams;
    const diasUmbral = parsePositiveIntParam(searchParams.get('dias'), {
      name: 'dias',
      fallback: 7,
      min: 1,
      max: 365,
    });
    if (!diasUmbral.success) return diasUmbral.response;

    const soloVencidos = parseBooleanParam(searchParams.get('solo_vencidos'), {
      name: 'solo_vencidos',
      fallback: false,
    });
    if (!soloVencidos.success) return soloVencidos.response;

    const prioridad = parseEnumParam(searchParams.get('prioridad'), PRIORIDADES_ALERTA_FILTRO, {
      name: 'prioridad',
      fallback: 'todos',
    });
    if (!prioridad.success) return prioridad.response;

    // Llamar función de base de datos
    const { data, error } = await supabase
      .rpc('obtener_productos_proximos_vencer', {
        p_dias_umbral: diasUmbral.value
      });

    if (error) {
      console.error('Error al obtener alertas de vencimiento:', error);
      return NextResponse.json(
        { error: 'Error al consultar productos próximos a vencer' },
        { status: 500 }
      );
    }

    let alertas = (data || []) as AlertaVencimientoRpcRow[];

    // Aplicar filtros adicionales
    if (soloVencidos.value) {
      alertas = alertas.filter((alerta) => alerta.prioridad === 'vencido');
    }

    if (prioridad.value !== 'todos') {
      alertas = alertas.filter((alerta) => alerta.prioridad === prioridad.value);
    }

    // Clasificar alertas por prioridad
    const clasificadas = {
      vencidos: alertas.filter((a) => a.prioridad === 'vencido'),
      alta: alertas.filter((a) => a.prioridad === 'alta'),
      media: alertas.filter((a) => a.prioridad === 'media'),
      baja: alertas.filter((a) => a.prioridad === 'baja')
    };

    // Calcular estadísticas
    const estadisticas = {
      total: alertas.length,
      total_vencidos: clasificadas.vencidos.length,
      total_proximos: alertas.length - clasificadas.vencidos.length,
      cantidad_total_vencidos: clasificadas.vencidos.reduce(
        (sum, a) => sum + Number(a.cantidad_disponible), 
        0
      ),
      cantidad_total_proximos: clasificadas.alta.concat(clasificadas.media, clasificadas.baja).reduce(
        (sum, a) => sum + Number(a.cantidad_disponible), 
        0
      ),
      por_prioridad: {
        vencidos: clasificadas.vencidos.length,
        alta: clasificadas.alta.length,
        media: clasificadas.media.length,
        baja: clasificadas.baja.length
      }
    };

    return NextResponse.json({
      success: true,
      configuracion: {
        dias_umbral: diasUmbral.value,
        solo_vencidos: soloVencidos.value
      },
      estadisticas,
      alertas: alertas.map((alerta) => ({
        id_inventario: alerta.id_inventario,
        id_producto: alerta.id_producto,
        nombre_producto: alerta.nombre_producto,
        cantidad_disponible: Number(alerta.cantidad_disponible),
        fecha_caducidad: alerta.fecha_caducidad,
        dias_para_vencer: alerta.dias_para_vencer,
        deposito: {
          id: alerta.id_deposito,
          nombre: alerta.nombre_deposito
        },
        unidad_simbolo: alerta.unidad_simbolo,
        prioridad: alerta.prioridad,
        estado: alerta.prioridad === 'vencido' ? 'vencido' : 'proximo_vencer'
      }))
    });

  } catch (error) {
    console.error('Error en GET /api/operador/alertas-vencimiento:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
