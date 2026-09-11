'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchOwnDatosBasicosAction, fetchOwnProfileAction, updateOwnProfileAction } from '@/modules/shared/actions/profile';
import type { UserProfile, UserProfileFormData } from '@/modules/shared/services/profileService';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';
export interface MessageState {
  type: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

interface UseProfileUpdateResult {
  profile: UserProfile | null;
  loading: LoadingState;
  message: MessageState | null;
  updateProfile: (data: UserProfileFormData) => Promise<boolean>;
  setMessage: (message: MessageState | null) => void;
}

/**
 * Shared "mi perfil" data + update hook, used by every role. Replaces the old
 * per-role `PerfilService`-backed hooks (`usePerfilUsuario` etc.) — the
 * Server Action always scopes to the current session's own row, so this
 * takes no `usuarioId` param at all.
 */
export function useProfileUpdate(): UseProfileUpdateResult {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<LoadingState>('idle');
  const [message, setMessage] = useState<MessageState | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading('loading');
    setMessage(null);

    const result = await fetchOwnProfileAction();
    if (!result.success) {
      setMessage({ type: 'error', text: 'Error al cargar los datos del perfil' });
      setLoading('error');
      return;
    }

    setProfile(result.data);
    setLoading('success');
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const updateProfile = async (data: UserProfileFormData): Promise<boolean> => {
    setLoading('loading');
    setMessage(null);

    const result = await updateOwnProfileAction(data);
    if (!result.success) {
      setMessage({ type: 'error', text: result.error });
      setLoading('error');
      return false;
    }

    setProfile(result.data);
    setMessage({ type: 'success', text: 'Perfil actualizado correctamente' });
    setLoading('success');
    setTimeout(() => setMessage(null), 3000);

    return true;
  };

  return { profile, loading, message, updateProfile, setMessage };
}

export function useDatosBasicosUsuario() {
  const [userData, setUserData] = useState<Pick<UserProfile, 'id' | 'nombre' | 'cedula' | 'telefono'> | null>(null);
  const [loading, setLoading] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading('loading');
      setError(null);

      const result = await fetchOwnDatosBasicosAction();
      if (cancelled) return;

      if (!result.success) {
        setError('Error al cargar los datos del usuario');
        setLoading('error');
        return;
      }

      setUserData(result.data);
      setLoading('success');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { userData, loading, error };
}
