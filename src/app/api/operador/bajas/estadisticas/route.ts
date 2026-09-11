import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { dbAdmin } from '@/db/client';
import { parsePositiveIntParam } from '@/lib/api-validation';
import { requireRole } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

type EstadisticasBajasRow = {
  total_bajas: string;
  total_cantidad: string;
  bajas_por_vencido: string;
  bajas_por_danado: string;
  bajas_por_contaminado: string;
  bajas_por_rechazado: string;
  bajas_por_otro: string;
  cantidad_vencido: string;
  cantidad_danado: string;
  cantidad_contaminado: string;
  cantidad_rechazado: string;
  cantidad_otro: string;
} & Record<string, unknown>;

const EMPTY_STATS: EstadisticasBajasRow = {
  total_bajas: '0',
  total_cantidad: '0',
  bajas_por_vencido: '0',
  bajas_por_danado: '0',
  bajas_por_contaminado: '0',
  bajas_por_rechazado: '0',
  bajas_por_otro: '0',
  cantidad_vencido: '0',
  cantidad_danado: '0',
  cantidad_contaminado: '0',
  cantidad_rechazado: '0',
  cantidad_otro: '0',
};

/**
 * GET /api/operador/bajas/estadisticas
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
    if (authResult.response) return authResult.response;

    const searchParams = request.nextUrl.searchParams;
    const periodo = parsePositiveIntParam(searchParams.get('periodo'), { name: 'periodo', fallback: 30, min: 1, max: 365 });
    if (!periodo.success) return periodo.response;

    const fecha_fin = new Date();
    const fecha_inicio = new Date();
    fecha_inicio.setDate(fecha_inicio.getDate() - periodo.value);

    let stats: EstadisticasBajasRow;
    try {
      const rows = await dbAdmin.execute<EstadisticasBajasRow>(
        sql`select * from obtener_estadisticas_bajas(${fecha_inicio.toISOString()}::timestamptz, ${fecha_fin.toISOString()}::timestamptz)`,
      );
      stats = rows[0] ?? EMPTY_STATS;
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      return NextResponse.json({ error: 'Error al consultar estadísticas' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      periodo: { dias: periodo.value, fecha_inicio: fecha_inicio.toISOString(), fecha_fin: fecha_fin.toISOString() },
      estadisticas: {
        total: { bajas: Number(stats.total_bajas), cantidad: Number(stats.total_cantidad) },
        por_motivo: {
          vencido: { bajas: Number(stats.bajas_por_vencido), cantidad: Number(stats.cantidad_vencido) },
          dañado: { bajas: Number(stats.bajas_por_danado), cantidad: Number(stats.cantidad_danado) },
          contaminado: { bajas: Number(stats.bajas_por_contaminado), cantidad: Number(stats.cantidad_contaminado) },
          rechazado: { bajas: Number(stats.bajas_por_rechazado), cantidad: Number(stats.cantidad_rechazado) },
          otro: { bajas: Number(stats.bajas_por_otro), cantidad: Number(stats.cantidad_otro) },
        },
      },
    });
  } catch (error) {
    console.error('Error en GET /api/operador/bajas/estadisticas:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
