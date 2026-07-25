import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileText, Package, X } from 'lucide-react';
import type { MotivoCancelacion } from '@/modules/shared/donaciones';
import type { Donacion } from '../types';

interface DonacionCancelacionModalProps {
  donacion: Donacion | null;
  isOpen: boolean;
  isProcessing?: boolean;
  onClose: () => void;
  onConfirm: (motivo: MotivoCancelacion, observaciones?: string) => Promise<void>;
}

const MAX_OBSERVACIONES_CANCELACION = 500;

export function DonacionCancelacionModal({
  donacion,
  isOpen,
  isProcessing = false,
  onClose,
  onConfirm,
}: DonacionCancelacionModalProps) {
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `cancelar-donacion-title-${donacion?.id ?? 'modal'}`;
  const errorId = `cancelar-donacion-error-${donacion?.id ?? 'modal'}`;

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  const handleClose = () => {
    if (isProcessing) return;
    setObservaciones('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedObservaciones = observaciones.trim();
    try {
      await onConfirm('solicitud_donante', trimmedObservaciones || undefined);
      handleClose();
    } catch (confirmationError: unknown) {
      setError(
        confirmationError instanceof Error
          ? confirmationError.message
          : 'No se pudo cancelar la donación.',
      );
    }
  };

  if (!isOpen || !donacion) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-description`}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl"
      >
        <div className="sticky top-0 flex items-center justify-between rounded-t-lg bg-gradient-to-r from-red-500 to-red-600 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <AlertTriangle aria-hidden="true" className="h-6 w-6" />
            <h2 id={titleId} className="text-xl font-bold">Cancelar donación</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            aria-label="Cerrar ventana de cancelación"
            className="rounded-full p-2 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4" id={`${titleId}-description`}>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <Package aria-hidden="true" className="h-5 w-5 text-gray-600" />
              <span>
                <strong>Donación:</strong> {donacion.cantidad} {donacion.unidad_simbolo} de {donacion.tipo_producto}
              </span>
            </p>
            <p><strong>Estado actual:</strong> {donacion.estado}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-5">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-gray-700">
            <p className="font-medium text-gray-900">Motivo: Solicitud del donante</p>
            <p className="mt-1">Este motivo se registra automáticamente para las cancelaciones realizadas por el donante.</p>
          </div>

          <div>
            <label htmlFor={`${titleId}-observaciones`} className="mb-2 block text-sm font-medium text-gray-700">
              Observaciones
            </label>
            <div className="relative">
              <FileText aria-hidden="true" className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <textarea
                id={`${titleId}-observaciones`}
                value={observaciones}
                onChange={(event) => setObservaciones(event.target.value)}
                rows={4}
                maxLength={MAX_OBSERVACIONES_CANCELACION}
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={error ? errorId : undefined}
                disabled={isProcessing}
                placeholder="Añade información relevante sobre la cancelación"
                className="w-full resize-none rounded-lg border border-gray-300 py-2 pl-10 pr-3 focus:border-red-500 focus:ring-2 focus:ring-red-500"
              />
            </div>
            <p className="mt-1 text-right text-xs text-gray-500">
              {observaciones.length}/{MAX_OBSERVACIONES_CANCELACION}
            </p>
          </div>

          {error && (
            <div id={errorId} role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Al cancelar, la donación permanecerá visible como <strong>Cancelada</strong> y se registrará el motivo en la bitácora.
          </div>

          <div className="flex gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isProcessing}
              className="min-h-11 flex-1 rounded-lg bg-gray-200 px-4 py-3 font-medium text-gray-700 hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="min-h-11 flex-1 rounded-lg bg-red-600 px-4 py-3 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? 'Procesando…' : 'Confirmar cancelación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
