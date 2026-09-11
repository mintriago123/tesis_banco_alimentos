'use client';

import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

interface AlertProps {
  readonly tipo: 'success' | 'error' | 'warning' | 'info';
  readonly mensaje: string;
  readonly onClose?: () => void;
}

export function Alert({ tipo, mensaje, onClose }: AlertProps) {
  const estilos = {
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    error: 'bg-rose-50 text-rose-800 border-rose-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200'
  };

  const iconos = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: TriangleAlert,
    info: Info,
  };

  const Icon = iconos[tipo];

  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-sm ${estilos[tipo]}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <div className="flex items-start gap-2">
        <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <span>{mensaje}</span>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-current opacity-70 hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          aria-label="Cerrar mensaje"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
