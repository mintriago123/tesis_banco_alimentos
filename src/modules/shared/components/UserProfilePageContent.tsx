'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExclamationCircleIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '@/app/components/DashboardLayout';
import { useSupabase } from '@/app/components/SupabaseProvider';
import UserProfileCard from './UserProfileCard';
import { Button } from '@/app/components/ui/Button';
import { LoadingState } from '@/app/components/ui/LoadingState';
import { accentForRole } from '@/app/components/ui/theme';

type RequiredRole = 'ADMINISTRADOR' | 'OPERADOR' | 'DONANTE' | 'SOLICITANTE' | 'ANY';
type Tone = 'red' | 'orange' | 'green' | 'blue';

interface UserProfile {
  id: string;
  email?: string;
  nombre: string;
  cedula?: string;
  ruc?: string;
  telefono: string;
  direccion: string;
  rol: string;
  tipo_persona: string;
  representante?: string;
  created_at?: string;
  updated_at?: string;
  latitud?: number | null;
  longitud?: number | null;
}

interface UserProfilePageContentProps {
  requiredRole?: RequiredRole;
  title?: string;
  editHref?: string;
  tone?: Tone;
}

const toneClasses: Record<Tone, {
  loading: string;
  errorIcon: string;
  retryButton: string;
}> = {
  red: {
    loading: 'text-red-600',
    errorIcon: 'text-red-500',
    retryButton: 'bg-red-600 hover:bg-red-700',
  },
  green: {
    loading: 'text-green-600',
    errorIcon: 'text-green-500',
    retryButton: 'bg-green-600 hover:bg-green-700',
  },
  orange: {
    loading: 'text-orange-700',
    errorIcon: 'text-orange-600',
    retryButton: 'bg-orange-700 hover:bg-orange-800',
  },
  blue: {
    loading: 'text-blue-700',
    errorIcon: 'text-blue-600',
    retryButton: 'bg-blue-700 hover:bg-blue-800',
  },
};

export default function UserProfilePageContent({
  requiredRole = 'ANY',
  title = 'Mi Perfil',
  editHref = '/perfil/actualizar',
  tone = 'red',
}: UserProfilePageContentProps) {
  const router = useRouter();
  const { supabase, user } = useSupabase();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const colors = toneClasses[tone];
  const accent = accentForRole(requiredRole === 'ANY' ? null : requiredRole);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) {
        setError('Usuario no autenticado');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        const { data: authUser } = await supabase.auth.getUser();

        const { data, error: fetchError } = await supabase
          .from('usuarios')
          .select('*')
          .eq('id', user.id)
          .single();

        if (fetchError) throw fetchError;

        if (data) {
          setProfile({
            ...data,
            email: authUser.user?.email || data.email || '',
          });
        }
      } catch (err: unknown) {
        console.error('Error al cargar perfil:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar el perfil');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [user, supabase]);

  if (isLoading) {
    return (
      <DashboardLayout requiredRole={requiredRole}>
        <LoadingState message="Cargando perfil…" />
      </DashboardLayout>
    );
  }

  if (error || !profile) {
    return (
      <DashboardLayout requiredRole={requiredRole}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <ExclamationCircleIcon className={`w-16 h-16 ${colors.errorIcon} mx-auto mb-4`} />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Error al cargar el perfil
            </h2>
            <p className="text-gray-600 mb-6">
              {error || 'No se pudieron cargar los datos del perfil.'}
            </p>
            <Button
              type="button"
              onClick={() => window.location.reload()}
              accent={accent}
            >
              Intentar de nuevo
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole={requiredRole} title={title}>
      <div className="max-w-3xl mx-auto">
        <UserProfileCard
          profile={profile}
          onEdit={() => router.push(editHref)}
          showMap={true}
        />
      </div>
    </DashboardLayout>
  );
}
