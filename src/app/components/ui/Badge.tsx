'use client';

interface BadgeProps {
  readonly children: React.ReactNode;
  readonly variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
  readonly size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'default', size = 'md' }: BadgeProps) {
  const variantClasses = {
    default: 'border border-slate-200 bg-slate-100 text-slate-700',
    success: 'border border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border border-rose-200 bg-rose-50 text-rose-800',
    warning: 'border border-amber-200 bg-amber-50 text-amber-800',
    info: 'border border-blue-200 bg-blue-50 text-blue-800'
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2 py-1 text-xs'
  };

  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${variantClasses[variant]} ${sizeClasses[size]}`}>
      {children}
    </span>
  );
}
