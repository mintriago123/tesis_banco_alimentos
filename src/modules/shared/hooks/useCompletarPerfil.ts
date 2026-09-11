import { useCallback, useState } from 'react';
import { checkDuplicateIdentificationAction, ensureDonorWarehouseAction, updateOwnProfileAction } from '@/modules/shared/actions/profile';
import type { UserProfileFormData } from '@/modules/shared/services/profileService';

/**
 * Backs the profile-completion/edit wizards (`/perfil/completar`,
 * `/perfil/actualizar`) — distinct from the simpler `useProfileUpdate` (used
 * by the "mi perfil" view pages) because this flow needs duplicate-document
 * checking and donor-warehouse provisioning on top of a plain save. Server
 * Action-backed equivalent of the old `useProfileUpdate(supabase)` hook.
 */
export function useCompletarPerfil() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const checkDuplicateIdentification = useCallback(async (tipo: 'Natural' | 'Juridica', value: string): Promise<boolean> => {
    const result = await checkDuplicateIdentificationAction(tipo, value);
    if (!result.success) {
      setError('No fue posible validar el documento.');
      return true;
    }
    if (result.data.duplicate) {
      setError(`Ya existe un usuario con es${tipo === 'Natural' ? 'a cédula' : 'e RUC'}.`);
      return true;
    }
    return false;
  }, []);

  const saveProfile = useCallback(async (profileData: UserProfileFormData): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updateOwnProfileAction(profileData);
      if (!result.success) {
        setError('No se pudo guardar el perfil. ' + result.error);
        return false;
      }

      setSuccess('¡Perfil guardado correctamente!');
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

  const ensureDonorWarehouse = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const result = await ensureDonorWarehouseAction();
      if (!result.success) {
        setError('No se pudo crear la bodega principal. ' + result.error);
        return false;
      }
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, success, setError, setSuccess, clearMessages, checkDuplicateIdentification, saveProfile, ensureDonorWarehouse };
}
