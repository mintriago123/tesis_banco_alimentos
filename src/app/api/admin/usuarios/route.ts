import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { dbAdmin } from '@/db/client';
import { usuarios } from '@/db/schema';
import { isPlainObject, requireRole, sanitizeAdminUserPatchUpdates, type AdminUserPatchUpdates } from '@/lib/server-auth';
import { validateCsrfRequest } from '@/lib/csrf';

const invalidPayload = (message: string) => NextResponse.json({ error: message }, { status: 400 });

async function readJsonBody(request: Request): Promise<{ body: unknown } | { response: NextResponse }> {
  try {
    return { body: await request.json() };
  } catch {
    return { response: invalidPayload('Payload JSON inválido.') };
  }
}

const FIELD_MAP: Record<keyof AdminUserPatchUpdates, keyof typeof usuarios.$inferInsert> = {
  nombre: 'nombre',
  telefono: 'telefono',
  direccion: 'direccion',
  estado: 'estado',
  fecha_fin_bloqueo: 'fechaFinBloqueo',
  motivo_bloqueo: 'motivoBloqueo',
  rol: 'rol',
  tipo_persona: 'tipoPersona',
  cedula: 'cedula',
  ruc: 'ruc',
  representante: 'representante',
};

function toDrizzleUpdate(updates: AdminUserPatchUpdates): Partial<typeof usuarios.$inferInsert> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    const column = FIELD_MAP[key as keyof AdminUserPatchUpdates];
    if (!column) continue;
    mapped[column] = key === 'fecha_fin_bloqueo' && typeof value === 'string' ? new Date(value) : value;
  }
  return mapped as Partial<typeof usuarios.$inferInsert>;
}

export async function PATCH(request: Request) {
  try {
    const csrfResponse = validateCsrfRequest(request);
    if (csrfResponse) {
      return csrfResponse;
    }

    const auth = await requireRole(['ADMINISTRADOR']);
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

    try {
      // Privileged cross-user write (an admin editing another user's record) — `dbAdmin`
      // (BYPASSRLS) matches the old app's use of `createAdminSupabaseClient()` here.
      await dbAdmin.update(usuarios).set(toDrizzleUpdate(sanitized.updates)).where(eq(usuarios.id, userId.trim()));
    } catch (error) {
      console.error('Error actualizando usuario:', error);
      const details = error instanceof Error ? error.message : 'Error desconocido';
      return NextResponse.json({ error: 'No fue posible actualizar el usuario', details }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en PATCH /api/admin/usuarios:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: 'Error interno al actualizar el usuario.', details: errorMessage }, { status: 500 });
  }
}
