/**
 * @fileoverview API para gestionar bajas de productos
 * Endpoints para registrar bajas y consultar historial (vía `v_bajas_productos_detalle`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { dbAdmin } from '@/db/client';
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

type DarBajaResultRow = {
  success: boolean;
  message: string;
  id_baja: string | null;
  cantidad_restante: string | null;
} & Record<string, unknown>;

/**
 * POST /api/operador/bajas
 * Registra una nueva baja de producto (RPC de servicio, bypassRLS vía dbAdmin
 * tras validar el rol explícitamente — igual que el service_role de antes).
 */
export async function POST(request: NextRequest) {
  try {
    const csrfResponse = validateCsrfRequest(request);
    if (csrfResponse) return csrfResponse;

    const authResult = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
    if (authResult.response) return authResult.response;

    const jsonBody = await readJsonObject(request);
    if (!jsonBody.success) return jsonBody.response;

    const idEntrada = parseUuid(jsonBody.value.id_entrada, { name: 'id_entrada' });
    if (!idEntrada.success) return idEntrada.response;

    const cantidad = parsePositiveNumber(jsonBody.value.cantidad, { name: 'cantidad' });
    if (!cantidad.success) return cantidad.response;

    const motivo = parseEnumParam(jsonBody.value.motivo, MOTIVOS_BAJA, { name: 'motivo' });
    if (!motivo.success) return motivo.response;

    const observaciones = parseOptionalText(jsonBody.value.observaciones, { name: 'observaciones', maxLength: 500 });
    if (!observaciones.success) return observaciones.response;

    let rows: DarBajaResultRow[];
    try {
      rows = await dbAdmin.execute<DarBajaResultRow>(
        sql`select * from dar_baja_producto(${idEntrada.value}::uuid, ${cantidad.value}::numeric, ${motivo.value}::text, ${authResult.profile.id}::uuid, ${observaciones.value}::text)`,
      );
    } catch (error) {
      console.error('Error al dar de baja producto:', error);
      return NextResponse.json({ error: 'Error al procesar la baja del producto' }, { status: 500 });
    }

    const resultado = rows[0];
    if (!resultado?.success) {
      return NextResponse.json({ error: resultado?.message || 'No se pudo completar la baja' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: resultado.message,
      data: { id_baja: resultado.id_baja, cantidad_restante: resultado.cantidad_restante ? Number(resultado.cantidad_restante) : null },
    });
  } catch (error) {
    console.error('Error en POST /api/operador/bajas:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

/**
 * GET /api/operador/bajas
 * Historial de bajas con filtros opcionales, leído desde `v_bajas_productos_detalle`.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
    if (authResult.response) return authResult.response;

    const searchParams = request.nextUrl.searchParams;
    const motivo = parseEnumParam(searchParams.get('motivo'), MOTIVOS_BAJA_FILTRO, { name: 'motivo', fallback: 'todos' });
    if (!motivo.success) return motivo.response;

    const fechaInicio = parseIsoDateParam(searchParams.get('fecha_inicio'), { name: 'fecha_inicio' });
    if (!fechaInicio.success) return fechaInicio.response;

    const fechaFin = parseIsoDateParam(searchParams.get('fecha_fin'), { name: 'fecha_fin' });
    if (!fechaFin.success) return fechaFin.response;

    if (fechaInicio.value && fechaFin.value && new Date(fechaInicio.value) > new Date(fechaFin.value)) {
      return NextResponse.json({ error: 'fecha_inicio no puede ser posterior a fecha_fin.' }, { status: 400 });
    }

    const pagination = parsePaginationParams(searchParams, { defaultLimit: 100, maxLimit: 200 });
    if (!pagination.success) return pagination.response;
    const { limit, offset } = pagination.value;

    const conditions = [];
    if (motivo.value !== 'todos') conditions.push(sql`motivo_baja = ${motivo.value}`);
    if (fechaInicio.value) conditions.push(sql`fecha_baja >= ${fechaInicio.value}`);
    if (fechaFin.value) conditions.push(sql`fecha_baja <= ${fechaFin.value}`);

    const whereClause = conditions.length > 0 ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;

    const rows = await dbAdmin.execute(
      sql`select * from v_bajas_productos_detalle ${whereClause} order by fecha_baja desc limit ${limit} offset ${offset}`,
    );
    const [{ count }] = await dbAdmin.execute<{ count: string }>(
      sql`select count(*)::text as count from v_bajas_productos_detalle ${whereClause}`,
    );
    const total = Number(count);

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { total, limit, offset, has_more: total > offset + limit },
    });
  } catch (error) {
    console.error('Error en GET /api/operador/bajas:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
