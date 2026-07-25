'use client';

import { useMemo, useState } from 'react';
import { Building2, Check, Clock3, MapPin, RefreshCw, Search, X } from 'lucide-react';
import { useSupabase } from '@/app/components/SupabaseProvider';
import { MapboxStaticMap } from '@/modules/shared/components';
import { useBodegaRequests } from '../hooks/useBodegaRequests';
import type { BodegaSolicitud, BodegaSolicitudFilters } from '@/modules/shared/bodegas';

const formatDate = (value: string) => new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const stateLabel: Record<BodegaSolicitud['estado'], string> = {
  PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada',
};

const stateClass: Record<BodegaSolicitud['estado'], string> = {
  PENDIENTE: 'border-amber-200 bg-amber-50 text-amber-700',
  APROBADA: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  RECHAZADA: 'border-rose-200 bg-rose-50 text-rose-700',
  CANCELADA: 'border-slate-200 bg-slate-100 text-slate-600',
};

const initialReasons = (): Record<string, string> => ({});

function RequestCard({
  solicitud,
  rejecting,
  reason,
  processing,
  onApprove,
  onStartReject,
  onReasonChange,
  onReject,
  onCancelReject,
}: {
  readonly solicitud: BodegaSolicitud;
  readonly rejecting: boolean;
  readonly reason: string;
  readonly processing: boolean;
  readonly onApprove: (id: string) => void;
  readonly onStartReject: (id: string) => void;
  readonly onReasonChange: (id: string, value: string) => void;
  readonly onReject: (id: string) => void;
  readonly onCancelReject: () => void;
}) {
  const isPending = solicitud.estado === 'PENDIENTE';
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-xl bg-orange-50 p-2.5 text-orange-700"><Building2 aria-hidden="true" className="h-5 w-5" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-900">{solicitud.nombre}</h2><span className="rounded-full border px-2 py-0.5 text-xs font-semibold">{solicitud.tipo === 'ALTA' ? 'Alta' : 'Modificación'}</span></div>
            <p className="mt-1 text-sm text-slate-600">{solicitud.donante?.nombre ?? 'Donante sin nombre'} · {solicitud.donante?.email ?? 'Sin correo'}</p>
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${stateClass[solicitud.estado]}`}>{stateLabel[solicitud.estado]}</span>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <p className="flex gap-2"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{solicitud.direccion}</p>
        <p><strong className="font-medium text-slate-500">Teléfono:</strong> {solicitud.telefono}</p>
        <p><strong className="font-medium text-slate-500">Enviada:</strong> {formatDate(solicitud.created_at)}</p>
        {solicitud.descripcion && <p><strong className="font-medium text-slate-500">Descripción:</strong> {solicitud.descripcion}</p>}
      </div>

      {solicitud.latitud !== null && solicitud.longitud !== null && <div className="mt-4"><MapboxStaticMap latitude={solicitud.latitud} longitude={solicitud.longitud} address={solicitud.direccion} height="180px" /></div>}

      {solicitud.estado === 'RECHAZADA' && solicitud.motivo_rechazo && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><strong>Motivo de rechazo:</strong> {solicitud.motivo_rechazo}</p>}
      {solicitud.revisado_at && <p className="mt-3 text-xs text-slate-500">Revisada el {formatDate(solicitud.revisado_at)}{solicitud.revisor?.nombre ? ` por ${solicitud.revisor.nombre}` : ''}.</p>}

      {isPending && !rejecting && <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => onStartReject(solicitud.id)} disabled={processing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"><X aria-hidden="true" className="h-4 w-4" /> Rechazar</button><button type="button" onClick={() => onApprove(solicitud.id)} disabled={processing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><Check aria-hidden="true" className="h-4 w-4" /> Aprobar</button></div>}

      {isPending && rejecting && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4"><label htmlFor={`motivo-${solicitud.id}`} className="mb-2 block text-sm font-semibold text-rose-900">Motivo del rechazo</label><textarea id={`motivo-${solicitud.id}`} value={reason} onChange={(event) => onReasonChange(solicitud.id, event.target.value)} maxLength={500} rows={3} autoFocus className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" aria-describedby={`motivo-ayuda-${solicitud.id}`} /><p id={`motivo-ayuda-${solicitud.id}`} className="mt-1 text-xs text-rose-700">Explica al donante qué debe corregir (mínimo 5 caracteres).</p><div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onCancelReject} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white">Cancelar</button><button type="button" onClick={() => onReject(solicitud.id)} disabled={processing || reason.trim().length < 5} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">{processing ? 'Guardando...' : 'Confirmar rechazo'}</button></div></div>}
    </article>
  );
}

export default function BodegaRequestsInbox() {
  const { supabase } = useSupabase();
  const { filteredSolicitudes, solicitudes, filters, setFilters, isLoading, errorMessage, refetch, service } = useBodegaRequests(supabase);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>(initialReasons);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const counters = useMemo(() => solicitudes.reduce<Record<string, number>>((accumulator, solicitud) => {
    accumulator[solicitud.estado] = (accumulator[solicitud.estado] ?? 0) + 1;
    return accumulator;
  }, {}), [solicitudes]);

  const updateFilters = (patch: Partial<BodegaSolicitudFilters>) => setFilters((previous) => ({ ...previous, ...patch }));

  const handleApprove = async (id: string) => {
    if (!window.confirm('¿Aprobar esta solicitud de bodega?')) return;
    setProcessingId(id); setMessage(null);
    try { await service.aprobarSolicitud(id); setMessage({ type: 'success', text: 'Solicitud aprobada y bodega actualizada.' }); await refetch(); }
    catch (error: unknown) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo aprobar la solicitud.' }); }
    finally { setProcessingId(null); }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id); setMessage(null);
    try { await service.rechazarSolicitud(id, reasons[id] ?? ''); setMessage({ type: 'success', text: 'Solicitud rechazada y donante notificado.' }); setRejectingId(null); await refetch(); }
    catch (error: unknown) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo rechazar la solicitud.' }); }
    finally { setProcessingId(null); }
  };

  return (
    <div className="space-y-6">
      {message && <div role={message.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{message.text}</div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Filtros de solicitudes">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <label className="relative block"><span className="sr-only">Buscar por donante o bodega</span><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={filters.search} onChange={(event) => updateFilters({ search: event.target.value })} placeholder="Buscar donante o bodega" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200" /></label>
          <label><span className="sr-only">Filtrar por estado</span><select value={filters.estado} onChange={(event) => updateFilters({ estado: event.target.value as BodegaSolicitudFilters['estado'] })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"><option value="PENDIENTE">Pendientes</option><option value="TODAS">Todos los estados</option><option value="APROBADA">Aprobadas</option><option value="RECHAZADA">Rechazadas</option><option value="CANCELADA">Canceladas</option></select></label>
          <button type="button" onClick={() => void refetch()} disabled={isLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600"><span className="rounded-full bg-amber-50 px-3 py-1">Pendientes: {counters.PENDIENTE ?? 0}</span><span className="rounded-full bg-emerald-50 px-3 py-1">Aprobadas: {counters.APROBADA ?? 0}</span><span className="rounded-full bg-rose-50 px-3 py-1">Rechazadas: {counters.RECHAZADA ?? 0}</span></div>
      </section>

      {errorMessage && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{errorMessage}</div>}
      {isLoading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600" aria-busy="true"><Clock3 aria-hidden="true" className="mx-auto mb-2 h-6 w-6 animate-pulse" />Cargando solicitudes...</div> : filteredSolicitudes.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">No hay solicitudes que coincidan con los filtros.</div> : <div className="grid gap-4 xl:grid-cols-2">{filteredSolicitudes.map((solicitud) => <RequestCard key={solicitud.id} solicitud={solicitud} rejecting={rejectingId === solicitud.id} reason={reasons[solicitud.id] ?? ''} processing={processingId === solicitud.id} onApprove={(id) => void handleApprove(id)} onStartReject={setRejectingId} onReasonChange={(id, value) => setReasons((previous) => ({ ...previous, [id]: value }))} onReject={(id) => void handleReject(id)} onCancelReject={() => setRejectingId(null)} />)}</div>}
    </div>
  );
}
