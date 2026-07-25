import DashboardLayout from '@/app/components/DashboardLayout';
import { UserSettingsContent } from '@/modules/shared/components/UserSettings';

export default function DonanteConfiguracionPage() {
  return (
    <DashboardLayout
      requiredRole="DONANTE"
      title="Configuración de Usuario"
      description="Gestiona tus preferencias y seguridad"
    >
      <UserSettingsContent variant="donante" showHeader={false} />
    </DashboardLayout>
  );
}
