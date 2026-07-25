'use client';

import { useCallback, useMemo, useState } from 'react';
import { Building2, Clock3, Eye, MapPin, RefreshCw, Search } from 'lucide-react';
import { Alert, Badge, Button, SelectInput, TextInput } from '@/app/components';
import { useSupabase } from '@/app/components/SupabaseProvider';
import { useBodegaRequests } from '../hooks/useBodegaRequests';
import type { BodegaSolicitud, BodegaSolicitudEstado, BodegaSolicitudFilters } from '@/modules/shared/bodegas';
import { BodegaRequestReviewModal, type BodegaRequestReviewMode } from './BodegaRequestReviewModal';

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
  ALTA: 'Alta',
  MODIFICACION: 'Modificación',
} as const;

interface RequestCardProps {
  readonly solicitud: BodegaSolicitud;
  readonly onReview: (solicitud: BodegaSolicitud) => void;
}

function RequestCard({ solicitud, onReview }: RequestCardProps) {
  const isPending = solicitud.estado === 'PENDIENTE';

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:border-slate-300 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700" aria-hidden="true">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words font-semibold text-slate-950">{solicitud.nombre}</h2>
              <Badge size="sm">{typeLabel[solicitud.tipo]}</Badge>
            </div>
            <p className="mt-1 break-words text-sm text-slate-600">
              {solicitud.donante?.nombre ?? 'Donante sin nombre'} · {solicitud.donante?.email ?? 'Sin correo'}
            </p>
          </div>
        </div>
        <Badge variant={stateVariant[solicitud.estado]}>{stateLabel[solicitud.estado]}</Badge>
      </div>

      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div className="flex min-w-0 items-start gap-2">
          <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dirección</dt>
            <dd className="mt-1 break-words text-slate-700">{solicitud.direccion}</dd>
          </div>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recibida</dt>
          <dd className="mt-1 text-slate-700">{formatDate(solicitud.created_at)}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <span className={`text-xs font-medium ${isPending ? 'text-amber-700' : 'text-slate-500'}`}>
          {isPending ? 'Requiere revisión' : 'Solicitud revisada'}
        </span>
        <Button type="button" variant="secondary" accent="operador" onClick={() => onReview(solicitud)}>
          <Eye aria-hidden="true" className="h-4 w-4" />
          Ver detalle
        </Button>
      </div>
    </article>
  );
}

type InboxMessage = { type: 'success' | 'error'; text: string };

export default function BodegaRequestsInbox() {
  const { supabase } = useSupabase();
  const { filteredSolicitudes, solicitudes, filters, setFilters, isLoading, errorMessage, refetch, service } = useBodegaRequests(supabase);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedSolicitud, setSelectedSolicitud] = useState<BodegaSolicitud | null>(null);
  const [reviewMode, setReviewMode] = useState<BodegaRequestReviewMode>('detail');
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [message, setMessage] = useState<InboxMessage | null>(null);

  const counters = useMemo(() => solicitudes.reduce<Partial<Record<BodegaSolicitudEstado, number>>>((accumulator, solicitud) => {
    accumulator[solicitud.estado] = (accumulator[solicitud.estado] ?? 0) + 1;
    return accumulator;
  }, {}), [solicitudes]);

  const hasActiveFilters = filters.search.trim().length > 0 || filters.estado !== 'PENDIENTE';
  const updateFilters = (patch: Partial<BodegaSolicitudFilters>) => setFilters((previous) => ({ ...previous, ...patch }));

  const openReview = (solicitud: BodegaSolicitud) => {
    setSelectedSolicitud(solicitud);
    setReviewMode('detail');
    setMotivoRechazo('');
    setMessage(null);
  };

  const closeReview = useCallback(() => {
    if (processingId) return;
    setSelectedSolicitud(null);
    setReviewMode('detail');
    setMotivoRechazo('');
  }, [processingId]);

  const finishReview = () => {
    setSelectedSolicitud(null);
    setReviewMode('detail');
    setMotivoRechazo('');
  };

  const handleApprove = async () => {
    if (!selectedSolicitud || selectedSolicitud.estado !== 'PENDIENTE') return;

    const id = selectedSolicitud.id;
    setProcessingId(id);
    setMessage(null);
    try {
      await service.aprobarSolicitud(id);
      finishReview();
      setMessage({ type: 'success', text: 'Solicitud aprobada y bodega actualizada.' });
      await refetch();
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo aprobar la solicitud.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!selectedSolicitud || selectedSolicitud.estado !== 'PENDIENTE' || motivoRechazo.trim().length < 5) return;

    const id = selectedSolicitud.id;
    setProcessingId(id);
    setMessage(null);
    try {
      await service.rechazarSolicitud(id, motivoRechazo);
      finishReview();
      setMessage({ type: 'success', text: 'Solicitud rechazada y donante notificado.' });
      await refetch();
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo rechazar la solicitud.' });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {message && <Alert tipo={message.type} mensaje={message.text} />}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Filtros de solicitudes">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <label className="relative block">
            <span className="sr-only">Buscar por donante o bodega</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <TextInput
              type="search"
              value={filters.search}
              onChange={(event) => updateFilters({ search: event.target.value })}
              placeholder="Buscar donante o bodega"
              className="pl-9"
            />
          </label>
          <label>
            <span className="sr-only">Filtrar por estado</span>
            <SelectInput
              value={filters.estado}
              onChange={(event) => updateFilters({ estado: event.target.value as BodegaSolicitudFilters['estado'] })}
            >
              <option value="PENDIENTE">Pendientes</option>
              <option value="TODAS">Todos los estados</option>
              <option value="APROBADA">Aprobadas</option>
              <option value="RECHAZADA">Rechazadas</option>
              <option value="CANCELADA">Canceladas</option>
            </SelectInput>
          </label>
          <Button type="button" variant="secondary" accent="operador" onClick={() => void refetch()} disabled={isLoading}>
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Resumen de solicitudes">
          <Badge variant="warning">Pendientes: {counters.PENDIENTE ?? 0}</Badge>
          <Badge variant="success">Aprobadas: {counters.APROBADA ?? 0}</Badge>
          <Badge variant="error">Rechazadas: {counters.RECHAZADA ?? 0}</Badge>
        </div>
      </section>

      {errorMessage && <Alert tipo="error" mensaje={errorMessage} />}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600" aria-busy="true">
          <Clock3 aria-hidden="true" className="mx-auto mb-2 h-6 w-6 animate-pulse" />
          Cargando solicitudes...
        </div>
      ) : filteredSolicitudes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          <p>No hay solicitudes que coincidan con los filtros.</p>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              className="mt-3"
              onClick={() => setFilters({ estado: 'PENDIENTE', search: '' })}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2" aria-label="Solicitudes de bodegas">
          {filteredSolicitudes.map((solicitud) => (
            <RequestCard key={solicitud.id} solicitud={solicitud} onReview={openReview} />
          ))}
        </div>
      )}

      <BodegaRequestReviewModal
        open={selectedSolicitud !== null}
        solicitud={selectedSolicitud}
        mode={reviewMode}
        motivoRechazo={motivoRechazo}
        processing={processingId === selectedSolicitud?.id}
        errorMessage={message?.type === 'error' ? message.text : null}
        onClose={closeReview}
        onModeChange={(mode) => {
          setMessage(null);
          setReviewMode(mode);
        }}
        onMotivoChange={setMotivoRechazo}
        onApprove={() => void handleApprove()}
        onReject={() => void handleReject()}
      />
    </div>
  );
}
