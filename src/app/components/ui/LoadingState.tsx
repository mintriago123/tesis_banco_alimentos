'use client';

import { LoaderCircle } from 'lucide-react';

interface LoadingStateProps {
  readonly message?: string;
}

export function LoadingState({ message = 'Cargando…' }: LoadingStateProps) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-slate-600" role="status" aria-live="polite">
      <LoaderCircle aria-hidden="true" className="h-7 w-7 animate-spin text-blue-700" />
      <span>{message}</span>
    </div>
  );
}
