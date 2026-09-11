import { useState, useEffect, useCallback } from 'react';
import { fetchDonantePerfilAction, type DonanteProfile } from '../actions';

interface UseUserProfileReturn {
  userProfile: DonanteProfile | null;
  loadingUser: boolean;
}

/**
 * `currentUser` (from `useSession()`) only gates *when* to fetch — the
 * profile itself is always re-derived server-side from the session, never
 * trusted from the client, so there's no `supabase`/user-id parameter anymore.
 */
export function useUserProfile(currentUser: { id: string } | null | undefined, authLoading: boolean): UseUserProfileReturn {
  const [userProfile, setUserProfile] = useState<DonanteProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const cargarPerfilUsuario = useCallback(async () => {
    setLoadingUser(true);
    try {
      const result = await fetchDonantePerfilAction();
      setUserProfile(result.success ? result.profile : null);
    } catch (error) {
      console.error('Error al cargar perfil del usuario:', error);
      setUserProfile(null);
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && currentUser !== undefined) {
      if (currentUser) {
        void cargarPerfilUsuario();
      } else {
        setUserProfile(null);
        setLoadingUser(false);
      }
    }
  }, [currentUser, authLoading, cargarPerfilUsuario]);

  return { userProfile, loadingUser };
}
