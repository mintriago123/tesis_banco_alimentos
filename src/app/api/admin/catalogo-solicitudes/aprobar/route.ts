import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { readJsonObject } from '@/lib/api-validation';
import { validateCsrfRequest } from '@/lib/csrf';
import { requireActiveUserRole } from '@/lib/server-auth';
import {
  parsePositiveIntegerArrayValue,
  parsePositiveIntegerValue,
  parseUuidValue,
} from '@/lib/validation-core';

const MAX_UNIDADES_SOLICITUD = 50;

export async function POST(request: Request) {
  try {
    const csrfResponse = validateCsrfRequest(request);
    if (csrfResponse) {
      return csrfResponse;
    }

    const supabase = await createServerSupabaseClient();
    const authResult = await requireActiveUserRole(supabase, ['ADMINISTRADOR']);

    if (authResult.response) {
      return authResult.response;
    }

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
    const unidadPrincipal = rawUnidadPrincipalId === undefined || rawUnidadPrincipalId === null
      ? { success: true as const, value: undefined }
      : parsePositiveIntegerValue(rawUnidadPrincipalId, {
          name: 'unidadPrincipalId',
          min: 1,
        });
    if (!unidadPrincipal.success) {
      return NextResponse.json({ error: unidadPrincipal.error }, { status: 400 });
    }

    const nombre = typeof jsonBody.value.nombre === 'string' ? jsonBody.value.nombre.trim() : '';
    const categoria = typeof jsonBody.value.categoria === 'string' ? jsonBody.value.categoria.trim() : '';

    if (!nombre || !categoria) {
      return NextResponse.json(
        { error: 'Nombre y categoría son obligatorios' },
        { status: 400 }
      );
    }

    if (unidadPrincipal.value !== undefined && !unidadIds.value.includes(unidadPrincipal.value)) {
      return NextResponse.json(
        { error: 'La unidad principal debe estar seleccionada' },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminSupabaseClient();
    const { data, error } = await adminSupabase.rpc('aprobar_solicitud_alta_alimento_server', {
      p_admin_id: authResult.user.id,
      p_categoria: categoria,
      p_nombre: nombre,
      p_solicitud_id: solicitudId.value,
      p_unidad_ids: unidadIds.value,
      p_unidad_principal_id: unidadPrincipal.value ?? null,
    });

    if (error) {
      console.error('Error aprobando solicitud de alta de alimento:', error);
      return NextResponse.json(
        { error: error.message || 'No fue posible aprobar la solicitud' },
        { status: 500 }
      );
    }

    const alimentoId = Number(data);

    if (!Number.isSafeInteger(alimentoId) || alimentoId <= 0) {
      return NextResponse.json(
        { error: 'La solicitud fue aprobada, pero la respuesta del alimento creado no es válida' },
        { status: 500 }
      );
    }

    return NextResponse.json({ alimentoId });
  } catch (error) {
    console.error('Error en POST /api/admin/catalogo-solicitudes/aprobar:', error);
    return NextResponse.json(
      { error: 'Error interno al aprobar la solicitud.' },
      { status: 500 }
    );
  }
}
