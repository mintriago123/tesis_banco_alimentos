'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Building2, CheckCircle2, Clock3, Edit3, MapPin, Plus, XCircle } from 'lucide-react';
import DashboardLayout from '@/app/components/DashboardLayout';
import { LoadingState } from '@/app/components/ui/LoadingState';
import { MapboxStaticMap } from '@/modules/shared/components';
import { BodegaSolicitudForm, useDonanteBodegas } from '@/modules/donante/bodegas';
import { cancelarSolicitudBodegaAction, crearSolicitudBodegaAction } from '@/modules/shared/bodegas/actions';
import type { Bodega, BodegaSolicitud, BodegaSolicitudInput } from '@/modules/shared/bodegas/types';

const statusStyles: Record<BodegaSolicitud['estado'], string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 border-amber-200',
  APROBADA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RECHAZADA: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELADA: 'bg-slate-100 text-slate-600 border-slate-200',
};

const statusLabels: Record<BodegaSolicitud['estado'], string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  CANCELADA: 'Cancelada',
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

function BodegaCard({ bodega, onEdit }: { readonly bodega: Bodega; readonly onEdit: (bodega: Bodega) => void }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
              <Building2 aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-slate-900">{bodega.nombre}</h3>
              {bodega.es_principal && <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Principal</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onEdit(bodega)}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            aria-label={`Solicitar modificación de ${bodega.nombre}`}
          >
            <Edit3 aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">Modificar</span>
          </button>
        </div>
        <dl className="mt-4 space-y-2 text-sm text-slate-600">
          <div className="flex gap-2">
            <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <dd>{bodega.direccion || 'Sin dirección registrada'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-medium text-slate-500">Teléfono</dt>
            <dd>{bodega.telefono || 'No registrado'}</dd>
          </div>
          {bodega.descripcion && (
            <div>
              <dt className="font-medium text-slate-500">Descripción</dt>
              <dd>{bodega.descripcion}</dd>
            </div>
          )}
        </dl>
      </div>
      {bodega.latitud !== null && bodega.longitud !== null && <MapboxStaticMap latitude={bodega.latitud} longitude={bodega.longitud} address={bodega.direccion ?? undefined} height="170px" />}
    </article>
  );
}

function SolicitudCard({ solicitud, onCancel }: { readonly solicitud: BodegaSolicitud; readonly onCancel: (id: string) => void }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{solicitud.tipo === 'ALTA' ? 'Nueva bodega' : 'Modificación'}</p>
          <h3 className="mt-1 font-semibold text-slate-900">{solicitud.nombre}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[solicitud.estado]}`}>{statusLabels[solicitud.estado]}</span>
      </div>
      <p className="mt-3 text-sm text-slate-600">Enviada el {formatDate(solicitud.created_at)}</p>
      {solicitud.estado === 'RECHAZADA' && solicitud.motivo_rechazo && (
        <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <strong>Motivo:</strong> {solicitud.motivo_rechazo}
        </p>
      )}
      {solicitud.estado === 'PENDIENTE' && (
        <button
          type="button"
          onClick={() => onCancel(solicitud.id)}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <XCircle aria-hidden="true" className="h-4 w-4" /> Cancelar solicitud
        </button>
      )}
    </article>
  );
}

export default function DonanteBodegasPage() {
  const { data: session } = useSession();
  const { bodegas, solicitudes, loadingState, errorMessage, refetch } = useDonanteBodegas(session?.user?.id ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingBodega, setEditingBodega] = useState<Bodega | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const openNewRequest = () => {
    setEditingBodega(null);
    setMessage(null);
    setFormOpen(true);
  };

  const openModification = (bodega: Bodega) => {
    setEditingBodega(bodega);
    setMessage(null);
    setFormOpen(true);
  };

  const handleSubmit = async (input: BodegaSolicitudInput) => {
    setSubmitting(true);
    setMessage(null);
    const result = await crearSolicitudBodegaAction(input);
    if (result.success) {
      await refetch();
      setFormOpen(false);
      setEditingBodega(null);
      setMessage({ type: 'success', text: 'Solicitud enviada. El equipo la revisará y recibirás una notificación.' });
    } else {
      setMessage({ type: 'error', text: result.error });
    }
    setSubmitting(false);
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm('¿Deseas cancelar esta solicitud pendiente?')) return;
    const result = await cancelarSolicitudBodegaAction(id);
    if (result.success) {
      await refetch();
      setMessage({ type: 'success', text: 'Solicitud cancelada.' });
    } else {
      setMessage({ type: 'error', text: result.error });
    }
  };

  if (loadingState === 'idle' || loadingState === 'loading') {
    return (
      <DashboardLayout requiredRole="DONANTE" title="Mis bodegas" description="Administra los lugares autorizados para tus donaciones">
        <LoadingState />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole="DONANTE" title="Mis bodegas" description="Administra los lugares autorizados para tus donaciones">
      <div className="space-y-8">
        {message && (
          <div role={message.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
            {message.text}
          </div>
        )}
        {errorMessage && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => void refetch()} className="rounded-lg bg-white px-3 py-2 font-semibold text-rose-700">
              Reintentar
            </button>
          </div>
        )}

        {formOpen ? (
          <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="bodega-form-title">
            <BodegaSolicitudForm
              bodega={editingBodega}
              submitting={submitting}
              onCancel={() => {
                setFormOpen(false);
                setEditingBodega(null);
              }}
              onSubmit={handleSubmit}
            />
          </section>
        ) : (
          <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">¿Necesitas registrar otro lugar?</h2>
              <p className="mt-1 text-sm text-slate-600">Las bodegas adicionales y sus cambios requieren aprobación del equipo.</p>
            </div>
            <button type="button" onClick={openNewRequest} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 sm:mt-0">
              <Plus aria-hidden="true" className="h-4 w-4" /> Solicitar nueva bodega
            </button>
          </section>
        )}

        <section aria-labelledby="bodegas-activas-title">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="bodegas-activas-title" className="text-xl font-semibold text-slate-900">
                Bodegas activas
              </h2>
              <p className="text-sm text-slate-600">Solo las bodegas aprobadas aparecen al registrar una donación.</p>
            </div>
            <CheckCircle2 aria-hidden="true" className="h-6 w-6 text-emerald-600" />
          </div>
          {bodegas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">Todavía no tienes una bodega activa. Completa tu perfil o solicita una nueva.</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {bodegas.map((bodega) => (
                <BodegaCard key={bodega.id_deposito} bodega={bodega} onEdit={openModification} />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="solicitudes-bodega-title">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="solicitudes-bodega-title" className="text-xl font-semibold text-slate-900">
                Mis solicitudes
              </h2>
              <p className="text-sm text-slate-600">Consulta el estado y el motivo de cualquier rechazo.</p>
            </div>
            <Clock3 aria-hidden="true" className="h-6 w-6 text-slate-500" />
          </div>
          {solicitudes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No has enviado solicitudes de bodegas.</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {solicitudes.map((solicitud) => (
                <SolicitudCard key={solicitud.id} solicitud={solicitud} onCancel={(id) => void handleCancel(id)} />
              ))}
            </div>
          )}
        </section>

        <p className="text-sm text-slate-600">
          ¿Aún no tienes una bodega principal?{' '}
          <Link href="/perfil/completar" className="font-semibold text-emerald-700 underline">
            Completa tu perfil
          </Link>
          .
        </p>
      </div>
    </DashboardLayout>
  );
}
