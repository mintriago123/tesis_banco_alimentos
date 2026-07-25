export type RoleAccent = 'admin' | 'operador' | 'donante' | 'solicitante';
export type Accent = RoleAccent | 'institucional';

export interface RoleTheme {
  readonly accent: Accent;
  readonly label: string;
  readonly primary: string;
  readonly primaryHover: string;
  readonly soft: string;
  readonly softHover: string;
  readonly text: string;
  readonly border: string;
  readonly focus: string;
}

export const roleThemes: Record<Accent, RoleTheme> = {
  admin: {
    accent: 'admin',
    label: 'Administrador',
    primary: 'bg-rose-700 text-white',
    primaryHover: 'hover:bg-rose-800',
    soft: 'border-rose-200 bg-rose-50 text-rose-800',
    softHover: 'hover:bg-rose-100',
    text: 'text-rose-700',
    border: 'border-rose-200',
    focus: 'focus-visible:ring-rose-500',
  },
  operador: {
    accent: 'operador',
    label: 'Operador',
    primary: 'bg-orange-700 text-white',
    primaryHover: 'hover:bg-orange-800',
    soft: 'border-orange-200 bg-orange-50 text-orange-800',
    softHover: 'hover:bg-orange-100',
    text: 'text-orange-700',
    border: 'border-orange-200',
    focus: 'focus-visible:ring-orange-500',
  },
  donante: {
    accent: 'donante',
    label: 'Donante',
    primary: 'bg-emerald-700 text-white',
    primaryHover: 'hover:bg-emerald-800',
    soft: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    softHover: 'hover:bg-emerald-100',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    focus: 'focus-visible:ring-emerald-500',
  },
  solicitante: {
    accent: 'solicitante',
    label: 'Solicitante',
    primary: 'bg-blue-700 text-white',
    primaryHover: 'hover:bg-blue-800',
    soft: 'border-blue-200 bg-blue-50 text-blue-800',
    softHover: 'hover:bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-200',
    focus: 'focus-visible:ring-blue-500',
  },
  institucional: {
    accent: 'institucional',
    label: 'Banco de Alimentos',
    primary: 'bg-blue-700 text-white',
    primaryHover: 'hover:bg-blue-800',
    soft: 'border-blue-200 bg-blue-50 text-blue-800',
    softHover: 'hover:bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-200',
    focus: 'focus-visible:ring-blue-500',
  },
};

export function accentForRole(role?: string | null): Accent {
  switch (role) {
    case 'ADMINISTRADOR':
      return 'admin';
    case 'OPERADOR':
      return 'operador';
    case 'DONANTE':
      return 'donante';
    case 'SOLICITANTE':
      return 'solicitante';
    default:
      return 'institucional';
  }
}
