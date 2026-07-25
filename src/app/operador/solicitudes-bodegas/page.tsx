'use client';

import DashboardLayout from '@/app/components/DashboardLayout';
import { BodegaRequestsInbox } from '@/modules/operador/bodegas';

export default function OperadorSolicitudesBodegasPage() {
  return (
    <DashboardLayout requiredRole="OPERADOR" title="Solicitudes de bodegas" description="Revisa, aprueba o rechaza las bodegas de los donantes.">
      <BodegaRequestsInbox />
    </DashboardLayout>
  );
}
