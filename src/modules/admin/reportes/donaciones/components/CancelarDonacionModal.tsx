/**
 * @fileoverview Modal para registrar la cancelación de una donación.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, XCircle } from 'lucide-react';
import { Alert, Badge, Button, FormField, TextareaInput } from '@/app/components';
import { Modal } from '@/app/components/ui/Modal';
import { MOTIVOS_CANCELACION_OPTIONS } from '@/modules/shared/donaciones/constants';
import type { Donation, MotivoCancelacion } from '../types';

interface CancelarDonacionModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly donacion: Donation | null;
  readonly onConfirm: (motivo: MotivoCancelacion, observaciones?: string) => Promise<void>;
  readonly isProcessing?: boolean;
}

const INITIAL_MOTIVO: MotivoCancelacion = 'solicitud_donante';

const estadoVariant = {
  Pendiente: 'warning',
  Aprobada: 'success',
  Cancelada: 'error',
} as const;

const displayText = (value: string | null | undefined) => value?.trim() || 'No registrado';

const formatQuantity = (value: number, unit: string) => (
  `${new Intl.NumberFormat('es-EC').format(value)} ${unit}`
);

export default function CancelarDonacionModal({
  isOpen,
  onClose,
  donacion,
  onConfirm,
  isProcessing = false,
}: CancelarDonacionModalProps) {
  const [motivo, setMotivo] = useState<MotivoCancelacion>(INITIAL_MOTIVO);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setMotivo(INITIAL_MOTIVO);
    setObservaciones('');
    setError(null);
  }, []);

  useEffect(() => {
    if (isOpen) resetForm();
  }, [donacion?.id, isOpen, resetForm]);

  const handleClose = useCallback(() => {
    if (isProcessing) return;
    resetForm();
    onClose();
  }, [isProcessing, onClose, resetForm]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isProcessing) return;

    setError(null);

    if (motivo === 'otro' && !observaciones.trim()) {
      setError('Las observaciones son obligatorias cuando seleccionas «Otro motivo».');
      return;
    }

    try {
      await onConfirm(motivo, observaciones.trim() || undefined);
      handleClose();
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo procesar la cancelación.');
    }
  };

  if (!isOpen || !donacion) return null;

  const productName = displayText(donacion.alimento?.nombre || donacion.tipo_producto);
  const observationError = motivo === 'otro' && error ? error : undefined;
  const isPending = donacion.estado === 'Pendiente';

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Cancelar donación"
      description={`Registra la razón de cancelación de ${productName}.`}
      size="lg"
      closeOnOverlayClick={!isProcessing}
      closeButtonDisabled={isProcessing}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4" aria-labelledby="cancel-donation-context-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700" aria-hidden="true">
                <XCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 id="cancel-donation-context-title" className="font-bold text-rose-950">Vas a cancelar esta donación</h3>
                <p className="mt-1 break-words text-sm text-rose-800">{formatQuantity(donacion.cantidad, donacion.unidad_simbolo)} de {productName}</p>
                <p className="mt-1 text-sm text-rose-800">Donante: {displayText(donacion.nombre_donante)}</p>
              </div>
            </div>
            <Badge variant={estadoVariant[donacion.estado]}>{donacion.estado}</Badge>
          </div>

          <dl className="mt-4 grid gap-3 border-t border-rose-200 pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-rose-700">Categoría</dt>
              <dd className="mt-1 text-rose-950">{displayText(donacion.categoria_comida)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-rose-700">Dirección de entrega</dt>
              <dd className="mt-1 break-words text-rose-950">{displayText(donacion.direccion_entrega)}</dd>
            </div>
          </dl>
        </section>

        {!isPending && (
          <Alert tipo="warning" mensaje="Esta donación ya no está pendiente. Verifica la información antes de continuar." />
        )}

        {error && !observationError && <Alert tipo="error" mensaje={error} />}

        <fieldset disabled={isProcessing}>
          <legend className="mb-3 text-sm font-bold text-slate-950">
            ¿Por qué se cancela la donación? <span className="text-rose-700" aria-hidden="true">*</span>
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {MOTIVOS_CANCELACION_OPTIONS.map((option) => {
              const inputId = `motivo-cancelacion-${option.value}`;
              const isSelected = motivo === option.value;

              return (
                <label
                  key={option.value}
                  htmlFor={inputId}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-rose-600 focus-within:ring-offset-1 ${
                    isSelected
                      ? 'border-rose-500 bg-rose-50'
                      : 'border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50/50'
                  }`}
                >
                  <input
                    id={inputId}
                    type="radio"
                    name="motivo-cancelacion"
                    value={option.value}
                    checked={isSelected}
                    onChange={() => {
                      setMotivo(option.value);
                      setError(null);
                    }}
                    className="sr-only"
                    data-autofocus={isSelected ? 'true' : undefined}
                  />
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? 'border-rose-700 bg-rose-700' : 'border-slate-300 bg-white'}`} aria-hidden="true">
                    {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">{option.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <FormField
          id="observaciones-cancelacion"
          label="Observaciones"
          required={motivo === 'otro'}
          hint={`${observaciones.length}/500 caracteres. Describe cualquier información que deba conocer el donante.`}
          error={observationError}
        >
          <TextareaInput
            id="observaciones-cancelacion"
            value={observaciones}
            onChange={(event) => {
              setObservaciones(event.target.value);
              if (error) setError(null);
            }}
            rows={4}
            maxLength={500}
            placeholder="Añade contexto o indica qué debe corregirse..."
            disabled={isProcessing}
          />
        </FormField>

        <Alert
          tipo="warning"
          mensaje="Al confirmar, se notificará al donante y esta acción no podrá deshacerse desde esta pantalla."
        />

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isProcessing}>
            Volver
          </Button>
          <Button type="submit" variant="danger" loading={isProcessing} disabled={!isPending}>
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            Confirmar cancelación
          </Button>
        </div>
      </form>
    </Modal>
  );
}
