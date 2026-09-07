import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export const USER_ROLES = ['ADMINISTRADOR', 'OPERADOR', 'DONANTE', 'SOLICITANTE'] as const;
export const USER_STATUSES = ['activo', 'bloqueado', 'desactivado'] as const;
export const ADMIN_USER_PATCH_FIELDS = [
  'nombre',
  'telefono',
  'direccion',
  'estado',
  'fecha_fin_bloqueo',
  'motivo_bloqueo',
  'rol',
  'tipo_persona',
  'cedula',
  'ruc',
  'representante',
] as const;

export type AppUserRole = (typeof USER_ROLES)[number];
export type AppUserStatus = (typeof USER_STATUSES)[number];
export type AdminUserPatchField = (typeof ADMIN_USER_PATCH_FIELDS)[number];
export type AdminUserPatchUpdates = Partial<Record<AdminUserPatchField, unknown>>;

export interface ActiveUserProfile {
  id: string;
  rol: AppUserRole;
  estado: AppUserStatus;
  nombre?: string | null;
  email?: string | null;
}

export type AuthResult = { user: User; response?: never } | { user?: never; response: NextResponse };
export type ProfileResult = { profile: ActiveUserProfile; response?: never } | { profile?: never; response: NextResponse };
export type AuthorizationResult = { authorized: true; response?: never } | { authorized?: never; response: NextResponse };
export type ActiveRoleResult =
  | { user: User; profile: ActiveUserProfile; response?: never }
  | { user?: never; profile?: never; response: NextResponse };
export type AuthOnlyResult =
  | { user: User; profile: ActiveUserProfile; response?: never }
  | { user?: never; profile?: never; response: NextResponse };
export type PatchValidationResult =
  | { success: true; updates: AdminUserPatchUpdates }
  | { success: false; error: string };

const unauthorized = () =>
  NextResponse.json({ error: 'Usuario no autenticado.' }, { status: 401 });

const forbidden = (message: string) =>
  NextResponse.json({ error: message }, { status: 403 });

const serverError = (message: string, details?: unknown) =>
  NextResponse.json({ error: message, details }, { status: 500 });

export const isValidUserRole = (value: unknown): value is AppUserRole =>
  typeof value === 'string' && USER_ROLES.includes(value as AppUserRole);

export const isValidUserStatus = (value: unknown): value is AppUserStatus =>
  typeof value === 'string' && USER_STATUSES.includes(value as AppUserStatus);

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const sanitizeAdminUserPatchUpdates = (updates: unknown): PatchValidationResult => {
  if (!isPlainObject(updates)) {
    return { success: false, error: 'updates debe ser un objeto.' };
  }

  const allowedFields = new Set<string>(ADMIN_USER_PATCH_FIELDS);
  const unknownFields = Object.keys(updates).filter(field => !allowedFields.has(field));

  if (unknownFields.length > 0) {
    return {
      success: false,
      error: `Campos no permitidos: ${unknownFields.join(', ')}.`,
    };
  }

  const sanitized: AdminUserPatchUpdates = {};

  for (const field of ADMIN_USER_PATCH_FIELDS) {
    if (!(field in updates)) {
      continue;
    }

    const value = updates[field];

    if (field === 'rol' && !isValidUserRole(value)) {
      return { success: false, error: 'rol inválido.' };
    }

    if (field === 'estado' && !isValidUserStatus(value)) {
      return { success: false, error: 'estado inválido.' };
    }

    sanitized[field] = value;
  }

  if (Object.keys(sanitized).length === 0) {
    return { success: false, error: 'updates no contiene campos permitidos.' };
  }

  return { success: true, updates: sanitized };
};

export async function getAuthenticatedUser(supabase: SupabaseClient): Promise<AuthResult> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return { response: unauthorized() };
  }

  return { user: data.user };
}

export async function getActiveUserProfile(
  adminSupabase: SupabaseClient,
  userId: string
): Promise<ProfileResult> {
  const { data, error } = await adminSupabase
    .from('usuarios')
    .select('id, rol, estado, nombre, email')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return {
      response: serverError('No fue posible validar el perfil del usuario.', error.message),
    };
  }

  if (!data || !isPlainObject(data)) {
    return { response: forbidden('Usuario sin perfil activo.') };
  }

  if (!isValidUserRole(data.rol)) {
    return { response: forbidden('Rol de usuario inválido.') };
  }

  if (data.estado !== 'activo') {
    return { response: forbidden('Usuario inactivo o bloqueado.') };
  }

  return {
    profile: {
      id: String(data.id),
      rol: data.rol,
      estado: data.estado,
      nombre: typeof data.nombre === 'string' ? data.nombre : null,
      email: typeof data.email === 'string' ? data.email : null,
    },
  };
}

export function assertRoleAllowed(profile: ActiveUserProfile, roles: readonly AppUserRole[]): AuthorizationResult {
  if (!roles.includes(profile.rol)) {
    return { response: forbidden('Rol no permitido.') };
  }

  return { authorized: true };
}

export async function requireActiveUserRole(
  supabase: SupabaseClient,
  roles: readonly AppUserRole[]
): Promise<ActiveRoleResult> {
  const authResult = await getAuthenticatedUser(supabase);

  if (authResult.response) {
    return { response: authResult.response };
  }

  const profileResult = await getActiveUserProfile(supabase, authResult.user.id);

  if (profileResult.response) {
    return { response: profileResult.response };
  }

  const roleResult = assertRoleAllowed(profileResult.profile, roles);

  if (roleResult.response) {
    return { response: roleResult.response };
  }

  return {
    user: authResult.user,
    profile: profileResult.profile,
  };
}

export async function requireAuth(supabase: SupabaseClient): Promise<AuthOnlyResult> {
  const authResult = await getAuthenticatedUser(supabase);

  if (authResult.response) {
    return { response: authResult.response };
  }

  const profileResult = await getActiveUserProfile(supabase, authResult.user.id);

  if (profileResult.response) {
    return { response: profileResult.response };
  }

  return {
    user: authResult.user,
    profile: profileResult.profile,
  };
}

export async function requireRole(
  supabase: SupabaseClient,
  roles: readonly AppUserRole[]
): Promise<ActiveRoleResult> {
  const auth = await requireAuth(supabase);

  if (auth.response) {
    return { response: auth.response };
  }

  const roleResult = assertRoleAllowed(auth.profile, roles);

  if (roleResult.response) {
    return { response: roleResult.response };
  }

  return {
    user: auth.user,
    profile: auth.profile,
  };
}
