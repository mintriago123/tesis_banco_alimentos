'use client';

interface LoadingSpinnerProps {
  readonly size?: 'sm' | 'md' | 'lg';
  readonly color?: 'blue' | 'red' | 'green' | 'orange' | 'gray';
  readonly mensaje?: string;
}

export function LoadingSpinner({ 
  size = 'md', 
  color = 'blue',
  mensaje 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  const colorClasses = {
    blue: 'border-blue-600',
    red: 'border-red-600',
    green: 'border-emerald-700',
    orange: 'border-orange-700',
    gray: 'border-gray-600'
  };

  return (
    <div className="flex items-center justify-center gap-3 py-12" role="status" aria-live="polite">
      <div className={`animate-spin rounded-full border-b-2 ${sizeClasses[size]} ${colorClasses[color]}`}></div>
      {mensaje && (
        <span className="text-sm text-slate-600">{mensaje}</span>
      )}
    </div>
  );
}
