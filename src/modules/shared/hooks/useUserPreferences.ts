import { useState } from 'react';
import { updateNotificationPreferenceAction } from '@/modules/shared/actions/account';

interface UserPreferences {
  recibir_notificaciones: boolean;
}

interface UseUserPreferencesReturn {
  preferences: UserPreferences;
  isSaving: boolean;
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  savePreferences: () => Promise<boolean>;
}

export function useUserPreferences(
  initialPreferences: UserPreferences = { recibir_notificaciones: true },
): UseUserPreferencesReturn {
  const [preferences, setPreferences] = useState<UserPreferences>(initialPreferences);
  const [isSaving, setIsSaving] = useState(false);

  const updatePreference = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  const savePreferences = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const result = await updateNotificationPreferenceAction(preferences.recibir_notificaciones);
      return result.success;
    } catch (error) {
      console.error('Error al guardar preferencias:', error);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { preferences, isSaving, updatePreference, savePreferences };
}
