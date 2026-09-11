import type { ServiceResult, UserRecord, UserRole, UserStatus } from '../types';
import { fetchUsersAction } from '../actions';

/** Ported from `createUserDataService(supabaseClient)`. `fetchUsers` now calls a Server Action; the two mutations already went through the (now-ported) `/api/admin/usuarios` route, unchanged. */
export const createUserDataService = () => {
  const fetchUsers = async (): Promise<ServiceResult<UserRecord[]>> => fetchUsersAction();

  const updateUserRole = async (userId: string, newRole: UserRole): Promise<ServiceResult<void>> => {
    try {
      const response = await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates: { rol: newRole } }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || 'No fue posible actualizar el rol', errorDetails: errorData };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: 'Error inesperado al actualizar el rol', errorDetails: err };
    }
  };

  const updateUserStatus = async (
    userId: string,
    newStatus: UserStatus,
    fechaFinBloqueo?: string | null,
    motivoBloqueo?: string | null,
  ): Promise<ServiceResult<void>> => {
    try {
      const updates: { estado: UserStatus; fecha_fin_bloqueo?: string | null; motivo_bloqueo?: string | null } = { estado: newStatus };

      if (newStatus === 'bloqueado' && fechaFinBloqueo) {
        updates.fecha_fin_bloqueo = fechaFinBloqueo;
        updates.motivo_bloqueo = motivoBloqueo || null;
      }

      if (newStatus === 'desactivado') {
        updates.fecha_fin_bloqueo = null;
        updates.motivo_bloqueo = motivoBloqueo || null;
      }

      if (newStatus === 'activo') {
        updates.fecha_fin_bloqueo = null;
        updates.motivo_bloqueo = null;
      }

      const response = await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || 'No fue posible actualizar el estado', errorDetails: errorData };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: 'Error inesperado al actualizar el estado', errorDetails: err };
    }
  };

  return { fetchUsers, updateUserRole, updateUserStatus };
};
