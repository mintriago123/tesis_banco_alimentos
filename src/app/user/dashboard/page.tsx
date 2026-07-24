'use client';

import { useState } from 'react';
import { useSupabase } from '@/app/components/SupabaseProvider';
import DashboardLayout from '@/app/components/DashboardLayout';
import { Alert } from '@/app/components/ui/Alert';
import { Button } from '@/app/components/ui/Button';
import { RefreshCw } from 'lucide-react';
import { DashboardUserCards, useDatosBasicosUsuario, useSolicitudes } from '@/modules/user';

export default function UsuarioDashboardPage() {
  const { user, supabase } = useSupabase();
  const { userData, loading: loadingUser, error: userError } = useDatosBasicosUsuario(supabase, user?.id);
  const { solicitudes, loading, error, refetch } = useSolicitudes(supabase, user?.id);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isLoading = loadingUser === 'loading' || (loading === 'loading' && solicitudes.length === 0);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  return (
    <DashboardLayout
      requiredRole="SOLICITANTE"
      title="Panel de Solicitante"
      description="Solicita alimentos y sigue el avance de tus pedidos."
    >
      <div className="space-y-6">
        {isLoading ? (
          <div className="space-y-6" aria-label="Cargando dashboard" aria-busy="true">
            <div className="h-64 animate-pulse rounded-3xl bg-blue-100" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((id) => (
                <div key={`skeleton-${id}`} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing}
                loading={isRefreshing}
                accent="solicitante"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                Actualizar datos
              </Button>
            </div>

            {(userError || error) && <Alert tipo="error" mensaje={userError || error || 'No fue posible cargar tus datos'} />}

            <DashboardUserCards nombre={userData?.nombre} solicitudes={solicitudes} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
