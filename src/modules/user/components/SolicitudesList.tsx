// ============================================================================
// Component: SolicitudesList
// Lista de solicitudes con filtros
// ============================================================================

import { Solicitud, SolicitudEditData, FiltroEstadoSolicitud } from '../types';
import { SolicitudCard } from './SolicitudCard';
import { FILTROS_ESTADO } from '../constants';
import { Alert, Badge, EmptyState, Surface } from '@/app/components';
import { FileText, Filter } from 'lucide-react';

interface SolicitudesListProps {
  solicitudes: Solicitud[];
  filtroEstado: FiltroEstadoSolicitud;
  onFiltroChange: (filtro: FiltroEstadoSolicitud) => void;
  onDelete: (solicitud: Solicitud) => void;
  onEdit: (id: string, data: SolicitudEditData) => Promise<boolean>;
  mensaje?: string;
}

export function SolicitudesList({
  solicitudes,
  filtroEstado,
  onFiltroChange,
  onDelete,
  onEdit,
  mensaje,
}: SolicitudesListProps) {
  return (
    <Surface className="mx-auto w-full min-w-0 max-w-5xl space-y-6 p-5 sm:p-6">
      {/* Filtros */}
      <section aria-labelledby="filtros-solicitudes-title">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700" aria-hidden="true">
              <Filter className="h-5 w-5" />
            </div>
            <div>
              <h2 id="filtros-solicitudes-title" className="text-lg font-semibold text-slate-950">
                Historial de solicitudes
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Filtra tus solicitudes por estado para consultar su avance.
              </p>
            </div>
          </div>
          <Badge variant="info">{solicitudes.length} resultado{solicitudes.length === 1 ? '' : 's'}</Badge>
        </div>

        <div className="mt-5" role="group" aria-label="Filtrar solicitudes por estado">
          <p className="mb-2 text-sm font-semibold text-slate-700">Estado</p>
          <div className="flex flex-wrap gap-2">
            {FILTROS_ESTADO.map(({ label, value }) => {
              const isActive = filtroEstado === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onFiltroChange(value as FiltroEstadoSolicitud)}
                  aria-pressed={isActive}
                  className={`min-h-10 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
                    isActive
                      ? 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Mensaje */}
      {mensaje && (
        <Alert
          tipo={mensaje.toLowerCase().includes('error') ? 'error' : 'success'}
          mensaje={mensaje}
        />
      )}

      {/* Lista de solicitudes */}
      {solicitudes.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No hay solicitudes para mostrar"
          description="Cuando envíes una solicitud de alimentos, aparecerá aquí para que puedas consultar su estado."
        />
      ) : (
        <div className="min-w-0 space-y-4" aria-live="polite">
          {solicitudes.map((solicitud) => (
            <SolicitudCard
              key={solicitud.id}
              solicitud={solicitud}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </Surface>
  );
}
