import DashboardLayout from '@/app/components/DashboardLayout';
import { UserSettingsContent } from '@/modules/shared/components/UserSettings';

export default function UserConfiguracionPage() {
  return (
    <DashboardLayout
      requiredRole="SOLICITANTE"
      title="Configuración de Usuario"
      description="Gestiona tus preferencias y seguridad"
    >
      <UserSettingsContent variant="solicitante" />
    </DashboardLayout>
  );
}
