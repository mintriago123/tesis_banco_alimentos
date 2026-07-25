/** Botón estándar para formularios de autenticación. */

import { Button } from '@/app/components/ui/Button';

interface AuthButtonProps {
  readonly type?: 'button' | 'submit' | 'reset';
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly cargando?: boolean;
  readonly textoNormal: string;
  readonly textoCargando?: string;
  readonly variant?: 'primary' | 'secondary';
  readonly fullWidth?: boolean;
  readonly className?: string;
}
export function AuthButton({
  type = 'button',
  onClick,
  disabled = false,
  cargando = false,
  textoNormal,
  textoCargando,
  variant = 'primary',
  fullWidth = true,
  className = '',
}: AuthButtonProps) {
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      loading={cargando}
      variant={variant}
      className={`${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {cargando ? textoCargando || textoNormal : textoNormal}
    </Button>
  );
}
