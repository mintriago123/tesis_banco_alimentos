import UserProfilePageContent from '@/modules/shared/components/UserProfilePageContent';

export default function DonantePerfilPage() {
  return (
    <UserProfilePageContent
      requiredRole="DONANTE"
      title="Mi Perfil"
      tone="green"
    />
  );
}
