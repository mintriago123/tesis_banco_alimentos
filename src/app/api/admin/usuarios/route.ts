import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  isPlainObject,
  requireRole,
  sanitizeAdminUserPatchUpdates,
} from '@/lib/server-auth';
import { validateCsrfRequest } from '@/lib/csrf';

const invalidPayload = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

async function readJsonBody(request: Request): Promise<{ body: unknown } | { response: NextResponse }> {
  try {
    return { body: await request.json() };
  } catch {
    return { response: invalidPayload('Payload JSON inválido.') };
  }
}

export async function PATCH(request: Request) {
  try {
    const csrfResponse = validateCsrfRequest(request);
    if (csrfResponse) {
      return csrfResponse;
    }

    const supabase = await createServerSupabaseClient();
    const auth = await requireRole(supabase, ['ADMINISTRADOR']);
    if (auth.response) {
      return auth.response;
    }

    const jsonBody = await readJsonBody(request);
    if ('response' in jsonBody) {
      return jsonBody.response;
    }

    if (!isPlainObject(jsonBody.body)) {
      return invalidPayload('El payload debe ser un objeto.');
    }

    const { userId, updates } = jsonBody.body;

    if (typeof userId !== 'string' || !userId.trim()) {
      return invalidPayload('userId es obligatorio.');
    }

    const sanitized = sanitizeAdminUserPatchUpdates(updates);

    if (!sanitized.success) {
      return invalidPayload(sanitized.error);
    }

    const admin = createAdminSupabaseClient();
    const { error } = await admin
      .from('usuarios')
      .update(sanitized.updates)
      .eq('id', userId.trim());

    if (error) {
      console.error('Error actualizando usuario:', error);
      return NextResponse.json(
        { error: 'No fue posible actualizar el usuario', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en PATCH /api/admin/usuarios:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { error: 'Error interno al actualizar el usuario.', details: errorMessage },
      { status: 500 }
    );
  }
}