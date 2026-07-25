'use client';

import type { ReactNode } from 'react';
import { roleThemes, type Accent } from './theme';

interface RoleBadgeProps {
  readonly role: Accent;
  readonly children?: ReactNode;
}

export function RoleBadge({ role, children }: RoleBadgeProps) {
  const theme = roleThemes[role];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${theme.soft}`}>
      {children ?? theme.label}
    </span>
  );
}

export type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
  readonly status: StatusVariant;
  readonly children: ReactNode;
}

const statusClasses: Record<StatusVariant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
};

export function StatusBadge({ status, children }: StatusBadgeProps) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}>{children}</span>;
}

