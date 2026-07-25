import UserProfilePageContent from '@/modules/shared/components/UserProfilePageContent';

export default function AdminPerfilPage() {
  return (
    <UserProfilePageContent
      requiredRole="ADMINISTRADOR"
      title="Mi Perfil"
      tone="red"
    />
  );
}
