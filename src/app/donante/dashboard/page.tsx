'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/app/components/DashboardLayout';
import { Alert } from '@/app/components/ui/Alert';
import { Button } from '@/app/components/ui/Button';
import { useProfileUpdate } from '@/modules/shared/hooks/useProfileUpdate';
import { useDonacionesData, useDonationStats } from '@/modules/donante/donaciones/hooks';
import { DashboardCardsGrid } from '@/modules/donante/dashboard/components/DashboardCardsGrid';
import { RefreshCw } from 'lucide-react';

export default function UsuarioDashboardPage() {
  const { data: session } = useSession();
  const user = session?.user ? { id: session.user.id } : null;
  const { profile, loading: loadingUserState } = useProfileUpdate();
  const loadingUser = loadingUserState === 'idle' || loadingUserState === 'loading';
  const { donaciones, cargando, mensaje, cargarDonaciones } = useDonacionesData(user);
  const estadisticas = useDonationStats(donaciones);

  useEffect(() => {
    if (user) {
      void cargarDonaciones();
    }
  }, [user, cargarDonaciones]);

  return (
    <DashboardLayout requiredRole="DONANTE" title="Panel de Donante" description="Gestiona tus aportes y sigue el impacto de tus donaciones.">
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
            <Button type="button" onClick={() => void cargarDonaciones()} disabled={cargando} loading={cargando} accent="donante">
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Actualizar datos
            </Button>
          </div>

          {mensaje && <Alert tipo="error" mensaje={mensaje} />}

          <DashboardCardsGrid nombre={profile?.nombre} donaciones={donaciones} stats={estadisticas} />
        </div>
      )}
    </DashboardLayout>
  );
}
