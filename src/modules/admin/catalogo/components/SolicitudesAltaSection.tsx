import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, X, XCircle } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCatalogoSolicitudesService, type SolicitudAltaAlimento } from '@/modules/catalogo-solicitudes';
import type { Unidad } from '../types';

interface SolicitudesAltaSectionProps {
  supabase: SupabaseClient;
  solicitudes: SolicitudAltaAlimento[];
  unidades: Unidad[];
  categories: string[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onCatalogRefresh: () => Promise<void>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

type ModalMode = 'aprobar' | 'rechazar';

interface ReviewModalProps {
  mode: ModalMode;
  solicitud: SolicitudAltaAlimento;
  unidades: Unidad[];
  categories: string[];
  onClose: () => void;
  onApprove: (values: { nombre: string; categoria: string; unidadIds: number[]; unidadPrincipalId?: number }) => Promise<void>;
  onReject: (comentario: string) => Promise<void>;
}

const estadoStyles: Record<SolicitudAltaAlimento['estado'], string> = {
  pendiente: 'border-amber-200 bg-amber-50 text-amber-700',
  aprobada: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rechazada: 'border-rose-200 bg-rose-50 text-rose-700'
};

const ReviewModal = ({
  mode,
  solicitud,
  unidades,
  categories,
  onClose,
  onApprove,
  onReject
}: ReviewModalProps) => {
  const [nombre, setNombre] = useState(solicitud.nombre);
  const [categoria, setCategoria] = useState(solicitud.categoria);
  const [categoriaPersonalizada, setCategoriaPersonalizada] = useState('');
  const [unidadIds, setUnidadIds] = useState<number[]>([]);
  const [unidadPrincipalId, setUnidadPrincipalId] = useState<number | undefined>();
  const [comentario, setComentario] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const categoriasDisponibles = useMemo(
    () => Array.from(new Set([...categories.filter(item => item !== 'todos' && item !== 'Sin categoría'), solicitud.categoria])),
    [categories, solicitud.categoria]
  );

  useEffect(() => {
    const ids = solicitud.unidades.map(unidad => unidad.unidad_id);
    setUnidadIds(ids);
    setUnidadPrincipalId(solicitud.unidades.find(unidad => unidad.es_unidad_principal)?.unidad_id);
  }, [solicitud]);

  const categoriaFinal = categoria === 'personalizada' ? categoriaPersonalizada : categoria;

  const unidadesPorTipo = unidades.reduce<Record<number, Unidad[]>>((acc, unidad) => {
    if (!acc[unidad.tipo_magnitud_id]) {
      acc[unidad.tipo_magnitud_id] = [];
    }
    acc[unidad.tipo_magnitud_id].push(unidad);
    return acc;
  }, {});

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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    if (mode === 'aprobar') {
      await onApprove({
        nombre,
        categoria: categoriaFinal,
        unidadIds,
        unidadPrincipalId
      });
    } else {
      await onReject(comentario);
    }

    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {mode === 'aprobar' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
            </h2>
            <p className="text-xs text-slate-500">{solicitud.nombre} · {solicitud.categoria}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {mode === 'aprobar' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="reviewNombre" className="mb-1 block text-sm font-medium text-slate-600">Nombre</label>
                  <input
                    id="reviewNombre"
                    value={nombre}
                    onChange={event => setNombre(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="reviewCategoria" className="mb-1 block text-sm font-medium text-slate-600">Categoría</label>
                  <select
                    id="reviewCategoria"
                    value={categoria}
                    onChange={event => setCategoria(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    required
                  >
                    <option value="">Selecciona una categoría</option>
                    {categoriasDisponibles.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    <option value="personalizada">Nueva categoría</option>
                  </select>
                </div>
              </div>

              {categoria === 'personalizada' && (
                <div>
                  <label htmlFor="reviewCategoriaPersonalizada" className="mb-1 block text-sm font-medium text-slate-600">Nueva categoría</label>
                  <input
                    id="reviewCategoriaPersonalizada"
                    value={categoriaPersonalizada}
                    onChange={event => setCategoriaPersonalizada(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    required
                  />
                </div>
              )}

              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-600">Unidades permitidas</p>
                <div className="max-h-72 space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
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
                                    ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                                }`}
                              >
                                <span className="block font-medium">{unidad.nombre}</span>
                                <span className="text-xs text-slate-500">{unidad.simbolo}</span>
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
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="comentarioRechazo" className="mb-1 block text-sm font-medium text-slate-600">Comentario de rechazo *</label>
              <textarea
                id="comentarioRechazo"
                value={comentario}
                onChange={event => setComentario(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-rose-400"
                rows={4}
                required
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                mode === 'aprobar' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {submitting ? 'Procesando...' : mode === 'aprobar' ? 'Aprobar y crear alimento' : 'Rechazar solicitud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const SolicitudesAltaSection = ({
  supabase,
  solicitudes,
  unidades,
  categories,
  loading,
  onRefresh,
  onCatalogRefresh,
  onSuccess,
  onError
}: SolicitudesAltaSectionProps) => {
  const service = useMemo(() => createCatalogoSolicitudesService(supabase), [supabase]);
  const [selected, setSelected] = useState<SolicitudAltaAlimento | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>('aprobar');

  const pendientes = solicitudes.filter(solicitud => solicitud.estado === 'pendiente').length;

  const openModal = (solicitud: SolicitudAltaAlimento, mode: ModalMode) => {
    setSelected(solicitud);
    setModalMode(mode);
  };

  const closeModal = () => {
    setSelected(null);
  };

  const handleApprove = async (values: { nombre: string; categoria: string; unidadIds: number[]; unidadPrincipalId?: number }) => {
    if (!selected) return;

    const result = await service.aprobarSolicitud({
      solicitudId: selected.id,
      ...values
    });

    if (result.success) {
      onSuccess('Solicitud aprobada y alimento creado');
      closeModal();
      await Promise.all([onRefresh(), onCatalogRefresh()]);
    } else {
      onError(result.error ?? 'No fue posible aprobar la solicitud');
    }
  };

  const handleReject = async (comentarioAdmin: string) => {
    if (!selected) return;

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      onError('No se pudo verificar el administrador actual');
      return;
    }

    const result = await service.rechazarSolicitud({
      solicitudId: selected.id,
      comentarioAdmin,
      adminId: authData.user.id
    });

    if (result.success) {
      onSuccess('Solicitud rechazada');
      closeModal();
      await onRefresh();
    } else {
      onError(result.error ?? 'No fue posible rechazar la solicitud');
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Cargando solicitudes de alta...
      </div>
    );
  }

  if (solicitudes.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
        No hay solicitudes de alta de alimentos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-800">{pendientes} solicitud{pendientes === 1 ? '' : 'es'} pendiente{pendientes === 1 ? '' : 's'}</p>
        <p className="text-xs text-slate-500">Las solicitudes pendientes aparecen primero.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Alimento</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Donante</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {solicitudes.map(solicitud => (
                <tr key={solicitud.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4">
                    <div className="text-sm font-semibold text-slate-800">{solicitud.nombre}</div>
                    <div className="text-xs text-slate-500">{solicitud.categoria}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {solicitud.unidades.map(unidad => unidad.unidad?.simbolo ?? unidad.unidad_id).join(', ')}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">
                    {solicitud.solicitante?.nombre || solicitud.solicitante?.email || 'Donante'}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold capitalize ${estadoStyles[solicitud.estado]}`}>
                      {solicitud.estado}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {solicitud.estado === 'pendiente' ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => openModal(solicitud, 'aprobar')}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => openModal(solicitud, 'rechazar')}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Rechazar
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">
                        Revisada el {solicitud.fecha_revision ? new Date(solicitud.fecha_revision).toLocaleDateString('es-EC') : '-'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <ReviewModal
          mode={modalMode}
          solicitud={selected}
          unidades={unidades}
          categories={categories}
          onClose={closeModal}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  );
};

export default SolicitudesAltaSection;
