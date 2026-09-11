export type Rol = 'DONANTE' | 'SOLICITANTE' | 'ADMINISTRADOR' | 'OPERADOR';

/** Roles a person may pick at self-registration. ADMINISTRADOR/OPERADOR are provisioned only by an admin. */
export const ROLES_REGISTRABLES: readonly Rol[] = ['DONANTE', 'SOLICITANTE'];

export const RUTA_POR_ROL: Record<Rol, string> = {
  ADMINISTRADOR: '/admin/dashboard',
  DONANTE: '/donante/dashboard',
  SOLICITANTE: '/user/dashboard',
  OPERADOR: '/operador/dashboard',
};

export function esRolValido(value: unknown): value is Rol {
  return value === 'DONANTE' || value === 'SOLICITANTE' || value === 'ADMINISTRADOR' || value === 'OPERADOR';
}

export interface MensajeAuth {
  tipo: 'error' | 'exito' | 'info';
  texto: string;
}
