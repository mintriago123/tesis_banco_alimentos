import UserProfilePageContent from '@/modules/shared/components/UserProfilePageContent';

export default function OperadorPerfilPage() {
  return (
    <UserProfilePageContent
      requiredRole="OPERADOR"
      title="Mi Perfil"
      tone="orange"
    />
  );
}
