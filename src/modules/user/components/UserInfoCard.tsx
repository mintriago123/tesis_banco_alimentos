// ============================================================================
// Component: UserInfoCard
// Tarjeta de información del usuario solicitante
// ============================================================================

import { User, IdCard, Phone } from 'lucide-react';
import { UserProfile } from '../types';

interface UserInfoCardProps {
  userData: Pick<UserProfile, 'nombre' | 'cedula' | 'telefono'>;
}

export function UserInfoCard({ userData }: UserInfoCardProps) {
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4" aria-labelledby="solicitante-info-title">
      <h3 id="solicitante-info-title" className="mb-3 flex items-center font-semibold text-blue-950">
        <User className="mr-2 h-5 w-5" aria-hidden="true" />
        Información del Solicitante
      </h3>
      <div className="grid gap-3 text-sm text-blue-900 sm:grid-cols-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>Nombre:</strong> {userData.nombre}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <IdCard className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>Cédula:</strong> {userData.cedula}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>Teléfono:</strong> {userData.telefono}
          </p>
        </div>
      </div>
    </section>
  );
}
