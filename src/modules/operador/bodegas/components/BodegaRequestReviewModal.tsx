'use client';

import { Building2, CalendarDays, Check, Mail, MapPin, Phone, UserRound, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, Badge, Button, FormField, Modal, TextareaInput } from '@/app/components';
import { MapboxStaticMap } from '@/modules/shared/components';
import type { BodegaSolicitud, BodegaSolicitudEstado } from '@/modules/shared/bodegas';

export type BodegaRequestReviewMode = 'detail' | 'reject';

interface BodegaRequestReviewModalProps {
  readonly open: boolean;
  readonly solicitud: BodegaSolicitud | null;
  readonly mode: BodegaRequestReviewMode;
  readonly motivoRechazo: string;
  readonly processing: boolean;
  readonly errorMessage?: string | null;
  readonly onClose: () => void;
  readonly onModeChange: (mode: BodegaRequestReviewMode) => void;
  readonly onMotivoChange: (value: string) => void;
  readonly onApprove: () => void;
  readonly onReject: () => void;
}

const formatDate = (value: string) => new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

const stateLabel: Record<BodegaSolicitudEstado, string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  CANCELADA: 'Cancelada',
};

const stateVariant: Record<BodegaSolicitudEstado, 'default' | 'success' | 'error' | 'warning' | 'info'> = {
  PENDIENTE: 'warning',
  APROBADA: 'success',
  RECHAZADA: 'error',
  CANCELADA: 'default',
};

const typeLabel = {
  ALTA: 'Alta de bodega',
  MODIFICACION: 'Modificación de bodega',
} as const;

interface DetailItemProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly children: ReactNode;
}

function DetailItem({ icon: Icon, label, children }: DetailItemProps) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
        <dd className="mt-1 break-words text-sm text-slate-800">{children}</dd>
      </div>
    </div>
  );
}

export function BodegaRequestReviewModal({
  open,
  solicitud,
  mode,
  motivoRechazo,
  processing,
  errorMessage,
  onClose,
  onModeChange,
  onMotivoChange,
  onApprove,
  onReject,
}: BodegaRequestReviewModalProps) {
  if (!solicitud) return null;

  const isPending = solicitud.estado === 'PENDIENTE';
  const isRejecting = mode === 'reject';
  const title = isRejecting ? 'Rechazar solicitud' : 'Revisar solicitud de bodega';
  const description = isRejecting
    ? `Indica al donante qué debe corregir en «${solicitud.nombre}».`
    : `${typeLabel[solicitud.tipo]} · ${stateLabel[solicitud.estado]}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="lg"
      closeOnOverlayClick={!processing}
      closeButtonDisabled={processing}
    >
      <div className="space-y-5">
        {errorMessage && <Alert tipo="error" mensaje={errorMessage} />}

        {isRejecting ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4" aria-label="Motivo del rechazo">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700" aria-hidden="true">
                <X className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold text-rose-950">¿Por qué se rechaza?</h3>
                <p className="mt-1 text-sm leading-5 text-rose-800">El motivo se enviará al donante para que pueda corregir la información.</p>
              </div>
            </div>
            <div className="mt-4">
              <FormField
                id="motivo-rechazo-bodega"
                label="Motivo del rechazo"
                required
                hint={`${motivoRechazo.length}/500 caracteres. Mínimo 5 caracteres.`}
              >
                <TextareaInput
                  id="motivo-rechazo-bodega"
                  value={motivoRechazo}
                  onChange={(event) => onMotivoChange(event.target.value)}
                  maxLength={500}
                  minLength={5}
                  rows={4}
                  placeholder="Ej.: La dirección no permite validar la ubicación de la bodega."
                  data-autofocus="true"
                  disabled={processing}
                />
              </FormField>
            </div>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700" aria-hidden="true">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="break-words font-semibold text-slate-950">{solicitud.nombre}</h3>
                  <p className="mt-1 text-sm text-slate-600">{typeLabel[solicitud.tipo]}</p>
                </div>
              </div>
              <Badge variant={stateVariant[solicitud.estado]}>{stateLabel[solicitud.estado]}</Badge>
            </div>

            <section aria-labelledby="bodega-review-donor" className="space-y-3">
              <h3 id="bodega-review-donor" className="text-sm font-bold text-slate-950">Información del donante</h3>
              <dl className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <DetailItem icon={UserRound} label="Nombre">{solicitud.donante?.nombre ?? 'Donante sin nombre'}</DetailItem>
                <DetailItem icon={Mail} label="Correo">{solicitud.donante?.email ?? 'Sin correo registrado'}</DetailItem>
                <DetailItem icon={Phone} label="Teléfono">{solicitud.donante?.telefono ?? solicitud.telefono}</DetailItem>
              </dl>
            </section>

            <section aria-labelledby="bodega-review-data" className="space-y-3">
              <h3 id="bodega-review-data" className="text-sm font-bold text-slate-950">Información de la bodega</h3>
              <dl className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
                <DetailItem icon={MapPin} label="Dirección">{solicitud.direccion}</DetailItem>
                <DetailItem icon={Phone} label="Teléfono de la bodega">{solicitud.telefono}</DetailItem>
                <DetailItem icon={CalendarDays} label="Fecha de solicitud">{formatDate(solicitud.created_at)}</DetailItem>
                {solicitud.descripcion && <DetailItem icon={Building2} label="Descripción">{solicitud.descripcion}</DetailItem>}
              </dl>
            </section>

            {solicitud.latitud !== null && solicitud.longitud !== null && (
              <section aria-labelledby="bodega-review-location" className="space-y-3">
                <div>
                  <h3 id="bodega-review-location" className="text-sm font-bold text-slate-950">Ubicación registrada</h3>
                  <p className="mt-1 text-xs text-slate-500">{solicitud.latitud.toFixed(6)}, {solicitud.longitud.toFixed(6)}</p>
                </div>
                <MapboxStaticMap
                  latitude={solicitud.latitud}
                  longitude={solicitud.longitud}
                  address={solicitud.direccion}
                  height="220px"
                />
              </section>
            )}

            {solicitud.estado === 'RECHAZADA' && solicitud.motivo_rechazo && (
              <Alert tipo="error" mensaje={`Motivo de rechazo: ${solicitud.motivo_rechazo}`} />
            )}

            {solicitud.revisado_at && (
              <p className="flex items-start gap-2 text-xs text-slate-500">
                <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                Revisada el {formatDate(solicitud.revisado_at)}{solicitud.revisor?.nombre ? ` por ${solicitud.revisor.nombre}` : ''}.
              </p>
            )}
          </>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={processing}>
            Cancelar
          </Button>
          {isRejecting ? (
            <Button
              type="button"
              variant="danger"
              onClick={onReject}
              loading={processing}
              disabled={motivoRechazo.trim().length < 5}
            >
              Confirmar rechazo
            </Button>
          ) : isPending ? (
            <>
              <Button type="button" variant="danger" onClick={() => onModeChange('reject')} disabled={processing}>
                <X aria-hidden="true" className="h-4 w-4" />
                Rechazar
              </Button>
              <Button type="button" accent="donante" onClick={onApprove} loading={processing}>
                <Check aria-hidden="true" className="h-4 w-4" />
                Aprobar solicitud
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
