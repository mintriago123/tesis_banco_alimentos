// ============================================================================
// Component: UbicacionCard
// Tarjeta de ubicación con mapa
// ============================================================================

import { MapPin } from 'lucide-react';
import MapboxMap from './MapboxMap';
import { Ubicacion } from '../types';

interface UbicacionCardProps {
  ubicacion: Ubicacion;
  onUbicacionChange: (lat: number, lng: number) => void;
}

export function UbicacionCard({
  ubicacion,
  onUbicacionChange,
}: UbicacionCardProps) {
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4" aria-labelledby="ubicacion-entrega-title">
      <h3 id="ubicacion-entrega-title" className="mb-3 flex items-center font-semibold text-blue-950">
        <MapPin className="mr-2 h-5 w-5" aria-hidden="true" />
        Ubicación de Entrega
      </h3>
      <div className="mb-3 text-sm text-blue-900">
        <p>
          <strong>Coordenadas:</strong> Lat {ubicacion.latitud.toFixed(5)}, Lng{' '}
          {ubicacion.longitud.toFixed(5)}
        </p>
        <p className="mt-1 text-xs text-blue-800">
          💡 Puedes ajustar la ubicación haciendo clic en el mapa o arrastrando
          el marcador
        </p>
      </div>
      <MapboxMap
        latitude={ubicacion.latitud}
        longitude={ubicacion.longitud}
        onLocationChange={onUbicacionChange}
        className="h-48 w-full rounded-xl border border-blue-200 shadow-sm"
      />
    </section>
  );
}
