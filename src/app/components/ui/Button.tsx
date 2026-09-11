'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { roleThemes, type Accent } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly accent?: Accent;
  readonly loading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  accent = 'institucional',
  loading = false,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const theme = roleThemes[accent];
  const variantClasses = {
    primary: `${theme.primary} ${theme.primaryHover} shadow-sm hover:shadow-md`,
    secondary: `${theme.soft} ${theme.softHover}`,
    danger: 'border border-rose-200 bg-rose-700 text-white hover:bg-rose-800 shadow-sm hover:shadow-md',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  } satisfies Record<ButtonVariant, string>;

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${theme.focus} ${variantClasses[variant]} ${className}`}
    >
      {loading && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

