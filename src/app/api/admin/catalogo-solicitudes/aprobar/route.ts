import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { dbAdmin } from '@/db/client';
import { readJsonObject } from '@/lib/api-validation';
import { validateCsrfRequest } from '@/lib/csrf';
import { requireRole } from '@/lib/server-auth';
import { parsePositiveIntegerArrayValue, parsePositiveIntegerValue, parseUuidValue } from '@/lib/validation-core';

const MAX_UNIDADES_SOLICITUD = 50;

export async function POST(request: Request) {
  try {
    const csrfResponse = validateCsrfRequest(request);
    if (csrfResponse) return csrfResponse;

    const authResult = await requireRole(['ADMINISTRADOR']);
    if (authResult.response) return authResult.response;

    const jsonBody = await readJsonObject(request);
    if (!jsonBody.success) return jsonBody.response;

    const solicitudId = parseUuidValue(jsonBody.value.solicitudId, { name: 'solicitudId' });
    if (!solicitudId.success) {
      return NextResponse.json({ error: solicitudId.error }, { status: 400 });
    }

    const unidadIds = parsePositiveIntegerArrayValue(jsonBody.value.unidadIds, {
      name: 'unidadIds',
      min: 1,
      maxItems: MAX_UNIDADES_SOLICITUD,
    });
    if (!unidadIds.success) {
      return NextResponse.json({ error: unidadIds.error }, { status: 400 });
    }

    const rawUnidadPrincipalId = jsonBody.value.unidadPrincipalId;
    const unidadPrincipal =
      rawUnidadPrincipalId === undefined || rawUnidadPrincipalId === null
        ? { success: true as const, value: undefined }
        : parsePositiveIntegerValue(rawUnidadPrincipalId, { name: 'unidadPrincipalId', min: 1 });
    if (!unidadPrincipal.success) {
      return NextResponse.json({ error: unidadPrincipal.error }, { status: 400 });
    }

    const nombre = typeof jsonBody.value.nombre === 'string' ? jsonBody.value.nombre.trim() : '';
    const categoria = typeof jsonBody.value.categoria === 'string' ? jsonBody.value.categoria.trim() : '';

    if (!nombre || !categoria) {
      return NextResponse.json({ error: 'Nombre y categoría son obligatorios' }, { status: 400 });
    }

    if (unidadPrincipal.value !== undefined && !unidadIds.value.includes(unidadPrincipal.value)) {
      return NextResponse.json({ error: 'La unidad principal debe estar seleccionada' }, { status: 400 });
    }

    let alimentoId: number;
    try {
      const [row] = await dbAdmin.execute<{ aprobar_solicitud_alta_alimento_server: number }>(
        sql`select aprobar_solicitud_alta_alimento_server(
          ${authResult.profile.id}::uuid,
          ${solicitudId.value}::uuid,
          ${nombre},
          ${categoria},
          ${unidadIds.value}::bigint[],
          ${unidadPrincipal.value ?? null}
        ) as aprobar_solicitud_alta_alimento_server`,
      );
      alimentoId = Number(row?.aprobar_solicitud_alta_alimento_server);
    } catch (error) {
      console.error('Error aprobando solicitud de alta de alimento:', error);
      const message = error instanceof Error ? error.message : 'No fue posible aprobar la solicitud';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (!Number.isSafeInteger(alimentoId) || alimentoId <= 0) {
      return NextResponse.json({ error: 'La solicitud fue aprobada, pero la respuesta del alimento creado no es válida' }, { status: 500 });
    }

    return NextResponse.json({ alimentoId });
  } catch (error) {
    console.error('Error en POST /api/admin/catalogo-solicitudes/aprobar:', error);
    return NextResponse.json({ error: 'Error interno al aprobar la solicitud.' }, { status: 500 });
  }
}
