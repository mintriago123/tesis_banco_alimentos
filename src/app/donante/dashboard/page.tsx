'use client';

import { useEffect } from 'react';
import { useSupabase } from '@/app/components/SupabaseProvider';
import DashboardLayout from '@/app/components/DashboardLayout';
import { Alert } from '@/app/components/ui/Alert';
import { Button } from '@/app/components/ui/Button';
import { usePerfilData } from '@/modules/donante/perfil/hooks';
import { useDonacionesData, useDonationStats } from '@/modules/donante/donaciones/hooks';
import { DashboardCardsGrid } from '@/modules/donante/dashboard/components';
import { RefreshCw } from 'lucide-react';

export default function UsuarioDashboardPage() {
  const { supabase, user } = useSupabase();
  const { profile, isLoading: loadingUser } = usePerfilData(supabase, user);
  const { donaciones, cargando, mensaje, cargarDonaciones } = useDonacionesData(supabase, user);
  const estadisticas = useDonationStats(donaciones);

  useEffect(() => {
    if (user) {
      void cargarDonaciones();
    }
  }, [user, cargarDonaciones]);

  return (
    <DashboardLayout
      requiredRole="DONANTE"
      title="Panel de Donante"
      description="Gestiona tus aportes y sigue el impacto de tus donaciones."
    >
      {loadingUser ? (
        <div className="space-y-6" aria-label="Cargando dashboard" aria-busy="true">
          <div className="h-64 animate-pulse rounded-3xl bg-emerald-100" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void cargarDonaciones()}
              disabled={cargando}
              loading={cargando}
              accent="donante"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Actualizar datos
            </Button>
          </div>

          {mensaje && <Alert tipo="error" mensaje={mensaje} />}

          <DashboardCardsGrid
            nombre={profile?.nombre}
            donaciones={donaciones}
            stats={estadisticas}
          />
        </div>
      )}
    </DashboardLayout>
  );
}
