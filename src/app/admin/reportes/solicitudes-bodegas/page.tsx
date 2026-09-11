'use client';

import DashboardLayout from '@/app/components/DashboardLayout';
import { BodegaRequestsInbox } from '@/modules/operador/bodegas';

export default function AdminSolicitudesBodegasPage() {
  return (
    <DashboardLayout requiredRole="ADMINISTRADOR" title="Solicitudes de bodegas" description="Audita las altas y modificaciones de bodegas de donantes.">
      <BodegaRequestsInbox />
    </DashboardLayout>
  );
}
