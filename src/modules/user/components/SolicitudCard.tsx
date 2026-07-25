// ============================================================================
// Component: SolicitudCard
// Tarjeta individual de solicitud con opciones de edición y eliminación
// ============================================================================

import { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  Edit,
  Calendar,
  MapPin,
  MessageCircle,
  ShoppingBasket,
  Hash,
  Send,
  X,
  Package,
  Eye,
  AlertCircle,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { Solicitud, SolicitudEditData } from '../types';
import { useDateFormatter } from '@/modules/shared/hooks/useDateFormatter';
import { createClient } from '@/lib/supabase';
import { SolicitudDetalleModal } from './SolicitudDetalleModal';
import { Badge, Button, TextareaInput } from '@/app/components';

const isDevelopment = process.env.NODE_ENV === 'development';

interface SolicitudCardProps {
  solicitud: Solicitud;
  onDelete: (solicitud: Solicitud) => void;
  onEdit: (id: string, data: SolicitudEditData) => Promise<boolean>;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function SolicitudCard({
  solicitud,
  onDelete,
  onEdit,
  canEdit = true,
  canDelete = true,
}: SolicitudCardProps) {
  const { formatDateTime } = useDateFormatter();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [showDetalle, setShowDetalle] = useState(false);
  const [formEdit, setFormEdit] = useState<SolicitudEditData>({
    comentarios: solicitud.comentarios || '',
  });
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [mostrarDetallesRechazo, setMostrarDetallesRechazo] = useState(false);
  const [mostrarDetallesAprobacion, setMostrarDetallesAprobacion] = useState(false);
  const [datosRechazo, setDatosRechazo] = useState<{
    nombreOperador: string;
    rolOperador: string;
  } | null>(null);
  const [datosAprobacion, setDatosAprobacion] = useState<{
    nombreOperador: string;
    rolOperador: string;
  } | null>(null);
  const [cargandoRechazo, setCargandoRechazo] = useState(false);
  const [cargandoAprobacion, setCargandoAprobacion] = useState(false);

  const getEstadoIcono = (estado: string) => {
    switch (estado.toLowerCase()) {
      case 'pendiente':
        return <Clock className="text-yellow-500 w-4 h-4" />;
      case 'aprobada':
        return <CheckCircle className="text-green-600 w-4 h-4" />;
      case 'rechazada':
        return <XCircle className="text-red-600 w-4 h-4" />;
      case 'entregada':
        return <Package className="text-blue-600 w-4 h-4" />;
      default:
        return null;
    }
  };

  const getEstadoBadgeVariant = (estado: string): 'default' | 'success' | 'error' | 'warning' | 'info' => {
    switch (estado.toLowerCase()) {
      case 'pendiente':
        return 'warning';
      case 'aprobada':
        return 'success';
      case 'rechazada':
        return 'error';
      case 'entregada':
        return 'info';
      default:
        return 'default';
    }
  };

  const handleEditar = () => {
    setEditandoId(solicitud.id);
    setFormEdit({
      comentarios: solicitud.comentarios || '',
    });
  };

  const handleCancelarEdicion = () => {
    setEditandoId(null);
    setFormEdit({ comentarios: '' });
  };

  const handleGuardar = async () => {
    setLoadingEdit(true);
    const success = await onEdit(solicitud.id, formEdit);

    if (success) {
      setEditandoId(null);
    }

    setLoadingEdit(false);
  };

  const puedeEditar =
    canEdit && solicitud.estado.toUpperCase() === 'PENDIENTE';
  const puedeEliminar =
    canDelete &&
    (solicitud.estado.toUpperCase() === 'RECHAZADA' ||
      solicitud.estado.toUpperCase() === 'PENDIENTE');
  
  const esRechazada = solicitud.estado.toUpperCase() === 'RECHAZADA';
  const esAprobada = solicitud.estado.toUpperCase() === 'APROBADA' || solicitud.estado.toUpperCase() === 'ENTREGADA';

  // Log de depuración para solicitudes rechazadas
  useEffect(() => {
    if (isDevelopment && esRechazada) {
      console.log('🔍 Datos de solicitud rechazada:', {
        id: solicitud.id,
        motivo_rechazo: solicitud.motivo_rechazo,
        fecha_rechazo: solicitud.fecha_rechazo,
        operador_rechazo_id: solicitud.operador_rechazo_id,
        comentario_admin: solicitud.comentario_admin,
      });
    }
  }, [esRechazada, solicitud]);

  // Cargar datos del operador/admin que rechazó
  useEffect(() => {
    if (mostrarDetallesRechazo && solicitud.operador_rechazo_id && !datosRechazo) {
      const cargarDatosOperador = async () => {
        setCargandoRechazo(true);
        try {
          const supabase = createClient();
          
          const { data, error } = await supabase
            .from('usuarios')
            .select('nombre, rol')
            .eq('id', solicitud.operador_rechazo_id)
            .single();

          if (error) {
            // Si hay error (probablemente permisos RLS), mostrar info genérica
            console.warn('⚠️ No se pudieron cargar datos del operador (permisos):', error.message || 'Sin acceso');
            setDatosRechazo({
              nombreOperador: 'Personal Administrativo',
              rolOperador: 'STAFF',
            });
          } else if (data) {
            setDatosRechazo({
              nombreOperador: data.nombre || 'Sistema',
              rolOperador: data.rol || 'OPERADOR',
            });
          } else {
            setDatosRechazo({
              nombreOperador: 'Personal Administrativo',
              rolOperador: 'STAFF',
            });
          }
        } catch {
          console.warn('⚠️ Excepción al cargar datos del operador');
          setDatosRechazo({
            nombreOperador: 'Personal Administrativo',
            rolOperador: 'STAFF',
          });
        } finally {
          setCargandoRechazo(false);
        }
      };

      void cargarDatosOperador();
    }
  }, [mostrarDetallesRechazo, solicitud.operador_rechazo_id, datosRechazo]);

  // Cargar datos del operador/admin que aprobó
  useEffect(() => {
    if (mostrarDetallesAprobacion && solicitud.operador_aprobacion_id && !datosAprobacion) {
      const cargarDatosAprobador = async () => {
        setCargandoAprobacion(true);
        try {
          const supabase = createClient();
          
          const { data, error } = await supabase
            .from('usuarios')
            .select('nombre, rol')
            .eq('id', solicitud.operador_aprobacion_id)
            .single();

          if (error) {
            console.warn('⚠️ No se pudieron cargar datos del aprobador (permisos):', error.message || 'Sin acceso');
            setDatosAprobacion({
              nombreOperador: 'Personal Administrativo',
              rolOperador: 'STAFF',
            });
          } else if (data) {
            setDatosAprobacion({
              nombreOperador: data.nombre || 'Sistema',
              rolOperador: data.rol || 'OPERADOR',
            });
          } else {
            setDatosAprobacion({
              nombreOperador: 'Personal Administrativo',
              rolOperador: 'STAFF',
            });
          }
        } catch {
          console.warn('⚠️ Excepción al cargar datos del aprobador');
          setDatosAprobacion({
            nombreOperador: 'Personal Administrativo',
            rolOperador: 'STAFF',
          });
        } finally {
          setCargandoAprobacion(false);
        }
      };

      void cargarDatosAprobador();
    }
  }, [mostrarDetallesAprobacion, solicitud.operador_aprobacion_id, datosAprobacion]);

  const getMotivoRechazoLabel = (motivo: string | null | undefined) => {
    const motivos: Record<string, string> = {
      stock_insuficiente: 'Stock insuficiente',
      producto_no_disponible: 'Producto no disponible',
      datos_incompletos: 'Datos incompletos',
      solicitante_ineligible: 'Solicitante inelegible',
      duplicada: 'Solicitud duplicada',
      vencimiento_proximo: 'Productos próximos a vencer',
      otro: 'Otro motivo',
    };
    return motivos[motivo || ''] || 'No especificado';
  };

  return (
    <article className="w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:border-slate-300 hover:shadow-md">
      {/* Modal de Detalle */}
      <SolicitudDetalleModal
        solicitud={solicitud}
        isOpen={showDetalle}
        onClose={() => setShowDetalle(false)}
      />

      {/* Encabezado */}
      <div className="flex min-w-0 flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700" aria-hidden="true">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getEstadoBadgeVariant(solicitud.estado)}>
                {getEstadoIcono(solicitud.estado)}
                <span>{solicitud.estado.charAt(0).toUpperCase() + solicitud.estado.slice(1)}</span>
              </Badge>
              <span className="text-xs font-medium text-slate-400">Solicitud registrada</span>
            </div>
            <h2 className="mt-3 break-words text-lg font-bold text-slate-950 sm:text-xl">
              {solicitud.tipo_alimento}
            </h2>
            <p className="mt-1 break-all text-xs text-slate-500">ID: {solicitud.id}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
        {/* Botón Ver Detalles */}
        <button
          type="button"
          onClick={() => setShowDetalle(true)}
          className="min-h-10 min-w-10 rounded-xl p-2 text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          title="Ver detalles"
          aria-label="Ver detalles de la solicitud"
        >
          <Eye className="mx-auto h-4 w-4" aria-hidden="true" />
          <span className="hidden text-xs font-semibold sm:inline">Ver</span>
        </button>

        {puedeEliminar && (
          <button
            type="button"
            onClick={() => onDelete(solicitud)}
            className="min-h-10 min-w-10 rounded-xl p-2 text-rose-700 transition-colors hover:bg-rose-50 hover:text-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
            title="Eliminar solicitud"
            aria-label="Eliminar solicitud"
        >
          <Trash2 className="mx-auto h-4 w-4" aria-hidden="true" />
          <span className="hidden text-xs font-semibold sm:inline">Eliminar</span>
          </button>
        )}

        {puedeEditar && editandoId !== solicitud.id && (
          <button
            type="button"
            onClick={handleEditar}
            className="min-h-10 min-w-10 rounded-xl p-2 text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            title="Editar solicitud"
            aria-label="Editar solicitud"
        >
          <Edit className="mx-auto h-4 w-4" aria-hidden="true" />
          <span className="hidden text-xs font-semibold sm:inline">Editar</span>
          </button>
        )}
      </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
      {/* Código de Comprobante - Solo si está aprobada */}
      {solicitud.codigo_comprobante && (
        <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="font-semibold text-emerald-700">Código:</span>
              <span className="break-all font-mono font-bold text-emerald-800">
                {solicitud.codigo_comprobante}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowDetalle(true)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:bg-emerald-100 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              Ver comprobante
            </button>
          </div>
        </div>
      )}

      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        {/* Alimento */}
        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <ShoppingBasket className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alimento solicitado</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{solicitud.tipo_alimento}</dd>
          </div>
        </div>

        {/* Cantidad */}
        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <Hash className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cantidad solicitada</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{solicitud.cantidad} {solicitud.unidad_simbolo || 'unidades'}</dd>
          </div>
        </div>

        {/* Fecha */}
        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha de solicitud</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{formatDateTime(solicitud.created_at)}</dd>
          </div>
        </div>

        {/* Comentarios */}
        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:col-span-2">
          <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Comentarios</dt>
            {editandoId === solicitud.id ? (
              <TextareaInput
                id={`comentarios-${solicitud.id}`}
                value={formEdit.comentarios}
                onChange={(e) => setFormEdit((f) => ({ ...f, comentarios: e.target.value }))}
                rows={2}
                className="mt-2 min-h-20 min-w-0 resize-none"
                placeholder="Añade un comentario"
                aria-label="Comentarios de la solicitud"
              />
            ) : (
              <dd className="mt-1 break-words text-sm text-slate-700">{solicitud.comentarios || 'Sin comentarios'}</dd>
            )}
          </div>
        </div>
      </dl>

      {/* Ubicación */}
      {solicitud.latitud && solicitud.longitud && (
        <details className="group min-w-0 rounded-xl border border-blue-200 bg-blue-50">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-inset">
            <span className="flex min-w-0 items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
              <span className="truncate">Ubicación registrada</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-blue-700 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-blue-200 p-4 text-sm text-blue-900">
            <p className="break-words">Lat {solicitud.latitud.toFixed(5)}, Lng {solicitud.longitud.toFixed(5)}</p>
            <iframe
              className="mt-3 block h-48 max-w-full rounded-xl border border-blue-200"
              src={`https://maps.google.com/maps?q=${solicitud.latitud},${solicitud.longitud}&z=15&output=embed`}
              title="Ubicación de la solicitud"
            ></iframe>
          </div>
        </details>
      )}

      {/* Botón Ver Más para solicitudes rechazadas */}
      {esRechazada && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-2">
          <button
            type="button"
            onClick={() => setMostrarDetallesRechazo(!mostrarDetallesRechazo)}
            aria-expanded={mostrarDetallesRechazo}
            className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 hover:text-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
          >
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {mostrarDetallesRechazo ? 'Ocultar detalles del rechazo' : 'Ver detalles del rechazo'}
          </button>
        </div>
      )}

      {/* Botón Ver Más para solicitudes aprobadas */}
      {esAprobada && solicitud.operador_aprobacion_id && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2">
          <button
            type="button"
            onClick={() => setMostrarDetallesAprobacion(!mostrarDetallesAprobacion)}
            aria-expanded={mostrarDetallesAprobacion}
            className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            {mostrarDetallesAprobacion ? 'Ocultar detalles de aprobación' : 'Ver detalles de aprobación'}
          </button>
        </div>
      )}

      {/* Botones de edición */}
      {editandoId === solicitud.id && (
        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          <Button
            type="button"
            onClick={handleGuardar}
            disabled={loadingEdit}
            loading={loadingEdit}
            accent="solicitante"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Guardar
          </Button>
          <Button
            type="button"
            onClick={handleCancelarEdicion}
            disabled={loadingEdit}
            variant="secondary"
            accent="solicitante"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Cancelar
          </Button>
        </div>
      )}
      </div>

      {/* Modal de Detalles de Rechazo */}
      {mostrarDetallesRechazo && esRechazada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-lg font-bold text-rose-700">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
                Detalles del Rechazo
              </h3>
              <button
                type="button"
                onClick={() => setMostrarDetallesRechazo(false)}
                className="min-h-10 min-w-10 rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                aria-label="Cerrar detalles del rechazo"
              >
                <X className="mx-auto h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Motivo del Rechazo */}
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="mb-1 text-sm font-semibold text-rose-900">Motivo del Rechazo</p>
                <p className="text-sm text-rose-800">
                  {getMotivoRechazoLabel(solicitud.motivo_rechazo)}
                </p>
              </div>

              {/* Comentario del Administrador/Operador */}
              {solicitud.comentario_admin && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-1 text-sm font-semibold text-slate-800">Comentario</p>
                  <p className="text-sm text-slate-700">{solicitud.comentario_admin}</p>
                </div>
              )}

              {/* Fecha y Hora del Rechazo */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-1 text-sm font-semibold text-slate-800">Fecha y Hora del Rechazo</p>
                <p className="text-sm text-slate-700">
                  {solicitud.fecha_rechazo ? formatDateTime(solicitud.fecha_rechazo) : 'No registrada'}
                </p>
              </div>

              {/* Quién rechazó */}
              {solicitud.operador_rechazo_id && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-1 text-sm font-semibold text-slate-800">Rechazado por</p>
                  {cargandoRechazo ? (
                    <p className="text-sm text-slate-600">Cargando...</p>
                  ) : datosRechazo ? (
                    <div className="text-sm text-slate-700">
                      <span
                          className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${
                          datosRechazo.rolOperador === 'ADMINISTRADOR' || datosRechazo.rolOperador === 'ADMIN'
                            ? 'border-violet-200 bg-violet-50 text-violet-800'
                            : datosRechazo.rolOperador === 'OPERADOR'
                            ? 'border-blue-200 bg-blue-50 text-blue-800'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {datosRechazo.rolOperador === 'ADMINISTRADOR' || datosRechazo.rolOperador === 'ADMIN'
                          ? 'Administrador' 
                          : datosRechazo.rolOperador === 'OPERADOR' 
                          ? 'Operador'
                          : datosRechazo.rolOperador === 'STAFF'
                          ? 'Personal Administrativo'
                          : datosRechazo.rolOperador}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">No disponible</p>
                  )}
                </div>
              )}
            </div>

            {/* Botón Cerrar */}
            <div className="mt-6">
              <Button
                type="button"
                onClick={() => setMostrarDetallesRechazo(false)}
                className="w-full"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalles de Aprobación */}
      {mostrarDetallesAprobacion && esAprobada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-lg font-bold text-emerald-700">
                <CheckCircle className="h-5 w-5" aria-hidden="true" />
                Detalles de la Aprobación
              </h3>
              <button
                type="button"
                onClick={() => setMostrarDetallesAprobacion(false)}
                className="min-h-10 min-w-10 rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                aria-label="Cerrar detalles de la aprobación"
              >
                <X className="mx-auto h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Comentario del Administrador/Operador */}
              {solicitud.comentario_admin && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="mb-1 text-sm font-semibold text-emerald-900">Comentario</p>
                  <p className="text-sm text-emerald-800">{solicitud.comentario_admin}</p>
                </div>
              )}

              {/* Fecha y Hora de Aprobación */}
              {solicitud.fecha_aprobacion && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-1 text-sm font-semibold text-slate-800">Fecha y Hora de Aprobación</p>
                  <p className="text-sm text-slate-700">{formatDateTime(solicitud.fecha_aprobacion)}</p>
                </div>
              )}

              {/* Quién aprobó */}
              {solicitud.operador_aprobacion_id && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-1 text-sm font-semibold text-slate-800">Aprobado por</p>
                  {cargandoAprobacion ? (
                    <p className="text-sm text-slate-600">Cargando...</p>
                  ) : datosAprobacion ? (
                    <div className="text-sm text-slate-700">
                      <span
                          className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${
                          datosAprobacion.rolOperador === 'ADMINISTRADOR' || datosAprobacion.rolOperador === 'ADMIN'
                            ? 'border-violet-200 bg-violet-50 text-violet-800'
                            : datosAprobacion.rolOperador === 'OPERADOR'
                            ? 'border-blue-200 bg-blue-50 text-blue-800'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {datosAprobacion.rolOperador === 'ADMINISTRADOR' || datosAprobacion.rolOperador === 'ADMIN'
                          ? 'Administrador' 
                          : datosAprobacion.rolOperador === 'OPERADOR' 
                          ? 'Operador'
                          : datosAprobacion.rolOperador === 'STAFF'
                          ? 'Personal Administrativo'
                          : datosAprobacion.rolOperador}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">No disponible</p>
                  )}
                </div>
              )}
            </div>

            {/* Botón Cerrar */}
            <div className="mt-6">
              <Button
                type="button"
                onClick={() => setMostrarDetallesAprobacion(false)}
                className="w-full"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
