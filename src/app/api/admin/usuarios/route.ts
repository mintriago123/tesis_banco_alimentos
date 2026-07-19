import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  getActiveUserProfile,
  getAuthenticatedUser,
  isPlainObject,
  isValidUserRole,
  requireRole,
  sanitizeAdminUserPatchUpdates,
} from '@/lib/server-auth';
import type { PostgrestSingleResponse, SupabaseClient } from '@supabase/supabase-js';

type CreateUserRequest = {
  email: string;
  password: string;
  rol: 'ADMINISTRADOR' | 'OPERADOR' | 'DONANTE' | 'SOLICITANTE';
  nombre?: string;
  tipo_persona?: string;
};

type AdminContext = {
  admin: SupabaseClient;
};

const invalidPayload = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

async function requireActiveAdmin(): Promise<AdminContext | { response: NextResponse }> {
  const supabase = await createServerSupabaseClient();
  const authResult = await getAuthenticatedUser(supabase);

  if (authResult.response) {
    return { response: authResult.response };
  }

  const admin = createAdminSupabaseClient();
  const profileResult = await getActiveUserProfile(admin, authResult.user.id);

  if (profileResult.response) {
    return { response: profileResult.response };
  }

  const roleResult = requireRole(profileResult.profile, ['ADMINISTRADOR']);

  if (roleResult.response) {
    return { response: roleResult.response };
  }

  return { admin };
}

async function readJsonBody(request: Request): Promise<{ body: unknown } | { response: NextResponse }> {
  try {
    return { body: await request.json() };
  } catch {
    return { response: invalidPayload('Payload JSON inválido.') };
  }
}

const parseCreateUserRequest = (body: unknown): CreateUserRequest | { response: NextResponse } => {
  if (!isPlainObject(body)) {
    return { response: invalidPayload('El payload debe ser un objeto.') };
  }

  const { email, password, rol, nombre, tipo_persona: tipoPersona } = body;

  if (typeof email !== 'string' || !email.trim()) {
    return { response: invalidPayload('email es obligatorio.') };
  }

  if (typeof password !== 'string' || !password.trim()) {
    return { response: invalidPayload('password es obligatorio.') };
  }

  if (!isValidUserRole(rol)) {
    return { response: invalidPayload('rol inválido.') };
  }

  return {
    email: email.trim(),
    password,
    rol,
    nombre: typeof nombre === 'string' ? nombre : undefined,
    tipo_persona: typeof tipoPersona === 'string' ? tipoPersona : undefined,
  };
};

export async function POST(request: Request) {
  try {
    const context = await requireActiveAdmin();
    if ('response' in context) {
      return context.response;
    }

    const jsonBody = await readJsonBody(request);
    if ('response' in jsonBody) {
      return jsonBody.response;
    }

    const body = parseCreateUserRequest(jsonBody.body);
    if ('response' in body) {
      return body.response;
    }

    // Crear usuario en auth con la clave de servicio
    const { data: authData, error: authError } = await context.admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });

    if (authError || !authData?.user) {
      console.error('Error creando usuario en auth:', authError);
      return NextResponse.json(
        { error: 'No se pudo crear el usuario de autenticación.' },
        { status: 500 }
      );
    }

    const userId = authData.user.id;

    const payload = {
      id: userId,
      rol: body.rol,
      tipo_persona: body.tipo_persona ?? 'natural',
      nombre: body.nombre ?? '',
      email: body.email,
      estado: 'activo' as const,
      updated_at: new Date().toISOString(),
    };

    const upsertRes: PostgrestSingleResponse<unknown> = await context.admin
      .from('usuarios')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (upsertRes.error) {
      console.error('Error registrando en usuarios:', upsertRes.error);
      return NextResponse.json(
        { error: 'Usuario creado en auth, pero falló al registrar en la tabla usuarios.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: userId,
      email: body.email,
      rol: body.rol,
    });
  } catch (error) {
    console.error('Error en POST /api/admin/usuarios:', error);
    return NextResponse.json(
      { error: 'Error interno al crear el usuario.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireActiveAdmin();
    if ('response' in context) {
      return context.response;
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

    // Actualizar usuario con bypass de RLS
    const { error } = await context.admin
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
