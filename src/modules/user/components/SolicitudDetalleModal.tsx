// ============================================================================
// Component: SolicitudDetalleModal
// Modal con detalles completos de una solicitud del usuario
// ============================================================================

import type { MouseEvent } from 'react';
import {
  X,
  Clock,
  CheckCircle,
  XCircle,
  Package,
  ShoppingBasket,
  Calendar,
  MapPin,
  MessageCircle,
  QrCode,
  ExternalLink,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { Solicitud } from '../types';
import { useDateFormatter } from '@/modules/shared/hooks/useDateFormatter';
import { Button } from '@/app/components';

interface SolicitudDetalleModalProps {
  solicitud: Solicitud;
  isOpen: boolean;
  onClose: () => void;
}

export function SolicitudDetalleModal({
  solicitud,
  isOpen,
  onClose,
}: SolicitudDetalleModalProps) {
  const { formatDateTime } = useDateFormatter();

  if (!isOpen) return null;

  const getEstadoBadge = (estado: string) => {
    const base = 'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ';
    switch (estado.toLowerCase()) {
      case 'pendiente':
        return base + 'border-amber-200 bg-amber-50 text-amber-800';
      case 'aprobada':
        return base + 'border-emerald-200 bg-emerald-50 text-emerald-800';
      case 'rechazada':
        return base + 'border-rose-200 bg-rose-50 text-rose-800';
      case 'entregada':
        return base + 'border-blue-200 bg-blue-50 text-blue-800';
      default:
        return base + 'border-slate-200 bg-slate-100 text-slate-800';
    }
  };

  const getEstadoIcon = (estado: string) => {
    switch (estado.toLowerCase()) {
      case 'pendiente':
        return <Clock className="w-4 h-4" />;
      case 'aprobada':
        return <CheckCircle className="w-4 h-4" />;
      case 'rechazada':
        return <XCircle className="w-4 h-4" />;
      case 'entregada':
        return <Package className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="solicitud-detalle-title"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-blue-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-blue-700" aria-hidden="true" />
            <h2 id="solicitud-detalle-title" className="text-xl font-bold text-slate-950">Detalles de la Solicitud</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 min-w-10 rounded-xl p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label="Cerrar detalles de la solicitud"
          >
            <X className="mx-auto h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[calc(90vh-140px)] space-y-6 overflow-y-auto p-6">
          {/* Estado */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Estado actual:</span>
            <span className={getEstadoBadge(solicitud.estado)}>
              {getEstadoIcon(solicitud.estado)}
              {solicitud.estado.charAt(0).toUpperCase() + solicitud.estado.slice(1)}
            </span>
          </div>

          {/* Código de Verificación */}
          {solicitud.codigo_comprobante && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="mb-3 flex items-center font-semibold text-slate-900">
                <QrCode className="mr-2 h-5 w-5 text-emerald-700" aria-hidden="true" />
                Código de Verificación
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wider text-slate-500">
                    Código de Comprobante
                  </p>
                  <p className="font-mono text-xl font-bold text-emerald-800">
                    {solicitud.codigo_comprobante}
                  </p>
                </div>
                <a
                  href={`/comprobante/${solicitud.codigo_comprobante}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Ver Comprobante
                </a>
              </div>
              <p className="mt-2 text-xs text-emerald-800">
                Presenta este código al momento de retirar los alimentos
              </p>
            </div>
          )}

          {/* Información del Alimento */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 flex items-center font-semibold text-slate-900">
              <ShoppingBasket className="mr-2 h-5 w-5 text-blue-700" aria-hidden="true" />
              Información del Alimento
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-500">Tipo de Alimento</p>
                <p className="font-medium text-slate-900">{solicitud.tipo_alimento}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Cantidad Solicitada</p>
                <p className="font-medium text-slate-900">
                  {solicitud.cantidad} {solicitud.unidad_simbolo || 'unidades'}
                </p>
              </div>
            </div>
          </div>

          {/* Fechas */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 flex items-center font-semibold text-slate-900">
              <Calendar className="mr-2 h-5 w-5 text-blue-700" aria-hidden="true" />
              Fechas
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-500">Fecha de Solicitud</p>
                <p className="font-medium text-slate-900">
                  {formatDateTime(solicitud.created_at)}
                </p>
              </div>
              {solicitud.fecha_respuesta && (
                <div>
                  <p className="text-sm text-slate-500">Fecha de Respuesta</p>
                  <p className="font-medium text-slate-900">
                    {formatDateTime(solicitud.fecha_respuesta)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Comentarios del Solicitante */}
          {solicitud.comentarios && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <h3 className="mb-2 flex items-center font-semibold text-slate-900">
                <MessageCircle className="mr-2 h-5 w-5 text-blue-700" aria-hidden="true" />
                Tus Comentarios
              </h3>
              <p className="text-slate-700">{solicitud.comentarios}</p>
            </div>
          )}

          {/* Comentario Administrativo */}
          {solicitud.comentario_admin && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-2 flex items-center font-semibold text-slate-900">
                <AlertCircle className="mr-2 h-5 w-5 text-amber-700" aria-hidden="true" />
                Respuesta del Banco de Alimentos
              </h3>
              <p className="text-slate-700">{solicitud.comentario_admin}</p>
            </div>
          )}

          {/* Ubicación */}
          {solicitud.latitud && solicitud.longitud && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <h3 className="mb-3 flex items-center font-semibold text-slate-900">
                <MapPin className="mr-2 h-5 w-5 text-blue-700" aria-hidden="true" />
                Ubicación Registrada
              </h3>
              <div className="mb-2 text-sm text-blue-900">
                Lat: {solicitud.latitud.toFixed(6)}, Lng: {solicitud.longitud.toFixed(6)}
              </div>
              <iframe
                className="h-48 w-full rounded-xl border border-blue-200"
                src={`https://maps.google.com/maps?q=${solicitud.latitud},${solicitud.longitud}&z=15&output=embed`}
                title="Ubicación de la solicitud"
              />
            </div>
          )}

          {/* ID de Solicitud */}
          <div className="text-center text-sm text-slate-400">
            ID de Solicitud: #{solicitud.id}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-4">
          <Button
            type="button"
            onClick={onClose}
            className="min-w-28"
          >
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
