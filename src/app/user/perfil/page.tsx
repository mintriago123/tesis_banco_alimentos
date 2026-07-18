import UserProfilePageContent from '@/modules/shared/components/UserProfilePageContent';

export default function UserPerfilPage() {
  return (
    <UserProfilePageContent
      requiredRole="SOLICITANTE"
      title="Mi Perfil"
      tone="red"
    />
  );
}
