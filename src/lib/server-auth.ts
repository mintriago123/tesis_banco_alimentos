import { NextResponse } from 'next/server';
import { auth } from '@/auth';

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

export type ProfileResult = { profile: ActiveUserProfile; response?: never } | { profile?: never; response: NextResponse };
export type AuthorizationResult = { authorized: true; response?: never } | { authorized?: never; response: NextResponse };
export type AuthOnlyResult =
  | { profile: ActiveUserProfile; response?: never }
  | { profile?: never; response: NextResponse };

const unauthorized = () => NextResponse.json({ error: 'Usuario no autenticado.' }, { status: 401 });
const forbidden = (message: string) => NextResponse.json({ error: message }, { status: 403 });

export const isValidUserRole = (value: unknown): value is AppUserRole =>
  typeof value === 'string' && USER_ROLES.includes(value as AppUserRole);

export const isValidUserStatus = (value: unknown): value is AppUserStatus =>
  typeof value === 'string' && USER_STATUSES.includes(value as AppUserStatus);

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type PatchValidationResult = { success: true; updates: AdminUserPatchUpdates } | { success: false; error: string };

export const sanitizeAdminUserPatchUpdates = (updates: unknown): PatchValidationResult => {
  if (!isPlainObject(updates)) {
    return { success: false, error: 'updates debe ser un objeto.' };
  }

  const allowedFields = new Set<string>(ADMIN_USER_PATCH_FIELDS);
  const unknownFields = Object.keys(updates).filter((field) => !allowedFields.has(field));

  if (unknownFields.length > 0) {
    return { success: false, error: `Campos no permitidos: ${unknownFields.join(', ')}.` };
  }

  const sanitized: AdminUserPatchUpdates = {};

  for (const field of ADMIN_USER_PATCH_FIELDS) {
    if (!(field in updates)) continue;
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

export function assertRoleAllowed(profile: ActiveUserProfile, roles: readonly AppUserRole[]): AuthorizationResult {
  if (!roles.includes(profile.rol)) {
    return { response: forbidden('Rol no permitido.') };
  }
  return { authorized: true };
}

/**
 * Replaces the old `requireAuth`/`requireActiveUserRole`/`requireRole` trio
 * (which each re-fetched a Supabase user then a `usuarios` row) with a single
 * check against the Auth.js session — the session callback in `src/auth.ts`
 * already re-reads `rol`/`estado` from the database on every `auth()` call,
 * so this stays just as fresh as the old per-request Supabase lookup.
 */
export async function requireAuth(): Promise<AuthOnlyResult> {
  const session = await auth();

  if (!session?.user) {
    return { response: unauthorized() };
  }

  const { id, rol, estado, name, email } = session.user;

  if (!isValidUserRole(rol)) {
    return { response: forbidden('Usuario sin perfil activo.') };
  }

  if (!isValidUserStatus(estado) || estado !== 'activo') {
    return { response: forbidden('Usuario inactivo o bloqueado.') };
  }

  return { profile: { id, rol, estado, nombre: name ?? null, email: email ?? null } };
}

export async function requireRole(roles: readonly AppUserRole[]): Promise<AuthOnlyResult> {
  const result = await requireAuth();
  if (result.response) return result;

  const roleResult = assertRoleAllowed(result.profile, roles);
  if (roleResult.response) return { response: roleResult.response };

  return result;
}
