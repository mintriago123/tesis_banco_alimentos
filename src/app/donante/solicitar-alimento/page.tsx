'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import { useSupabase } from '@/app/components/SupabaseProvider';
import { createCatalogoSolicitudesService, type SolicitudAltaAlimento } from '@/modules/catalogo-solicitudes';
import { sendNotification } from '@/modules/shared/services/notificationClient';
import type { Unidad } from '@/modules/admin/catalogo/types';
import { CheckCircle2, ClipboardList, Send } from 'lucide-react';

const estadoStyles: Record<SolicitudAltaAlimento['estado'], string> = {
  pendiente: 'border-amber-200 bg-amber-50 text-amber-700',
  aprobada: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rechazada: 'border-rose-200 bg-rose-50 text-rose-700'
};

export default function SolicitarAlimentoPage() {
  const { supabase, user, isLoading } = useSupabase();
  const service = useMemo(() => createCatalogoSolicitudesService(supabase), [supabase]);

  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [categoriaPersonalizada, setCategoriaPersonalizada] = useState('');
  const [comentario, setComentario] = useState('');
  const [categorias, setCategorias] = useState<string[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [unidadIds, setUnidadIds] = useState<number[]>([]);
  const [unidadPrincipalId, setUnidadPrincipalId] = useState<number | undefined>();
  const [solicitudes, setSolicitudes] = useState<SolicitudAltaAlimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const categoriaFinal = categoria === 'personalizada' ? categoriaPersonalizada : categoria;

  const loadData = useCallback(async () => {
    setLoading(true);

    const [alimentosResult, unidadesResult, solicitudesResult] = await Promise.all([
      supabase.from('alimentos').select('categoria').order('categoria'),
      supabase
        .from('unidades')
        .select('id, nombre, simbolo, tipo_magnitud_id, es_base, tipos_magnitud!inner(nombre)')
        .order('tipo_magnitud_id', { ascending: true })
        .order('nombre', { ascending: true }),
      service.listarSolicitudes()
    ]);

    if (!alimentosResult.error) {
      setCategorias(
        Array.from(new Set((alimentosResult.data ?? []).map(item => item.categoria).filter(Boolean))).sort()
      );
    }

    if (!unidadesResult.error) {
      const unidadesConTipo = (unidadesResult.data ?? []).map(unidad => {
        const tipoMagnitud = unidad.tipos_magnitud as { nombre?: string | null } | null;

        return {
          id: unidad.id,
          nombre: unidad.nombre,
          simbolo: unidad.simbolo,
          tipo_magnitud_id: unidad.tipo_magnitud_id,
          tipo_magnitud_nombre: tipoMagnitud?.nombre ?? undefined,
          es_base: unidad.es_base
        };
      });
      setUnidades(unidadesConTipo);
    }

    if (solicitudesResult.success && solicitudesResult.data) {
      setSolicitudes(solicitudesResult.data);
    }

    setLoading(false);
  }, [service, supabase]);

  useEffect(() => {
    if (!isLoading) {
      void loadData();
    }
  }, [isLoading, loadData]);

  const toggleUnidad = (unidadId: number) => {
    setUnidadIds(prev => {
      if (prev.includes(unidadId)) {
        if (unidadPrincipalId === unidadId) {
          setUnidadPrincipalId(undefined);
        }
        return prev.filter(id => id !== unidadId);
      }

      return [...prev, unidadId];
    });
  };

  const unidadesPorTipo = unidades.reduce<Record<number, Unidad[]>>((acc, unidad) => {
    if (!acc[unidad.tipo_magnitud_id]) {
      acc[unidad.tipo_magnitud_id] = [];
    }
    acc[unidad.tipo_magnitud_id].push(unidad);
    return acc;
  }, {});

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!user) {
      setMessage({ type: 'error', text: 'Usuario no autenticado' });
      return;
    }

    if (!nombre.trim() || !categoriaFinal.trim()) {
      setMessage({ type: 'error', text: 'Completa el nombre y la categoría propuesta' });
      return;
    }

    if (unidadIds.length === 0) {
      setMessage({ type: 'error', text: 'Selecciona al menos una unidad permitida' });
      return;
    }

    setSubmitting(true);
    const result = await service.crearSolicitud({
      solicitanteId: user.id,
      nombre,
      categoria: categoriaFinal,
      comentarioDonante: comentario,
      unidadIds,
      unidadPrincipalId
    });
    setSubmitting(false);

    if (result.success && result.data?.id) {
      await sendNotification({
        event: 'catalog_food_request_created',
        entityId: result.data.id
      });

      setNombre('');
      setCategoria('');
      setCategoriaPersonalizada('');
      setComentario('');
      setUnidadIds([]);
      setUnidadPrincipalId(undefined);
      setMessage({ type: 'success', text: 'Solicitud enviada para revisión' });
      await loadData();
    } else if (result.success) {
      setMessage({ type: 'error', text: 'La solicitud fue creada, pero no se pudo identificar para notificarla' });
    } else {
      setMessage({ type: 'error', text: result.error ?? 'No fue posible enviar la solicitud' });
    }
  };

  return (
    <DashboardLayout
      requiredRole="DONANTE"
      title="Solicitar alta de alimento"
      description="Propón alimentos para que un administrador los revise y agregue al catálogo"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {message && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                message.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="nombre" className="mb-1 block text-sm font-medium text-slate-700">Nombre del alimento *</label>
              <input
                id="nombre"
                value={nombre}
                onChange={event => setNombre(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Ej. Quinua cocida"
                maxLength={120}
                required
              />
            </div>

            <div>
              <label htmlFor="categoria" className="mb-1 block text-sm font-medium text-slate-700">Categoría propuesta *</label>
              <select
                id="categoria"
                value={categoria}
                onChange={event => setCategoria(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
                required
              >
                <option value="">Selecciona una categoría</option>
                {categorias.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
                <option value="personalizada">Nueva categoría</option>
              </select>
            </div>
          </div>

          {categoria === 'personalizada' && (
            <div>
              <label htmlFor="categoriaPersonalizada" className="mb-1 block text-sm font-medium text-slate-700">Nombre de la nueva categoría *</label>
              <input
                id="categoriaPersonalizada"
                value={categoriaPersonalizada}
                onChange={event => setCategoriaPersonalizada(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Ej. Preparados refrigerados"
                maxLength={120}
                required
              />
            </div>
          )}

          <div>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-slate-800">Unidades permitidas *</h2>
              <p className="text-xs text-slate-500">Marca las unidades que tendrían sentido para este alimento.</p>
            </div>

            {loading ? (
              <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Cargando unidades...</div>
            ) : (
              <div className="max-h-80 space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                {Object.entries(unidadesPorTipo).map(([tipoId, unidadesTipo]) => (
                  <div key={tipoId} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {unidadesTipo[0]?.tipo_magnitud_nombre ?? `Tipo ${tipoId}`}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {unidadesTipo.map(unidad => {
                        const selected = unidadIds.includes(unidad.id);
                        const principal = unidadPrincipalId === unidad.id;

                        return (
                          <div key={unidad.id} className="relative">
                            <button
                              type="button"
                              onClick={() => toggleUnidad(unidad.id)}
                              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                                selected
                                  ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>
                                  <span className="block font-medium">{unidad.nombre}</span>
                                  <span className="text-xs text-slate-500">{unidad.simbolo}</span>
                                </span>
                                {selected && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                              </div>
                            </button>
                            {selected && (
                              <button
                                type="button"
                                onClick={() => setUnidadPrincipalId(unidad.id)}
                                className={`absolute -right-1 -top-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  principal
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-200 text-slate-600 hover:bg-emerald-100'
                                }`}
                              >
                                {principal ? 'Principal' : 'Marcar'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="comentario" className="mb-1 block text-sm font-medium text-slate-700">Comentario opcional</label>
            <textarea
              id="comentario"
              value={comentario}
              onChange={event => setComentario(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
              rows={4}
              maxLength={500}
              placeholder="Incluye detalles que ayuden al administrador a revisar la solicitud."
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Enviando...' : 'Enviar solicitud'}
            </button>
          </div>
        </form>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-800">Mis solicitudes</h2>
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Cargando solicitudes...</div>
          ) : solicitudes.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Aún no has enviado solicitudes de alta.
            </div>
          ) : (
            <div className="space-y-3">
              {solicitudes.map(solicitud => (
                <article key={solicitud.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">{solicitud.nombre}</h3>
                      <p className="text-xs text-slate-500">{solicitud.categoria}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold capitalize ${estadoStyles[solicitud.estado]}`}>
                      {solicitud.estado}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Enviada el {new Date(solicitud.created_at).toLocaleDateString('es-EC')}
                  </p>
                  {solicitud.comentario_admin && (
                    <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                      {solicitud.comentario_admin}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
