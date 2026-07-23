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
    <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <h3 className="mb-3 flex items-center font-semibold text-blue-900">
        <MapPin className="w-5 h-5 mr-2" />
        Ubicación de Entrega
      </h3>
      <div className="mb-3 text-sm text-blue-800">
        <p>
          <strong>Coordenadas:</strong> Lat {ubicacion.latitud.toFixed(5)}, Lng{' '}
          {ubicacion.longitud.toFixed(5)}
        </p>
        <p className="mt-1 text-xs text-blue-700">
          💡 Puedes ajustar la ubicación haciendo clic en el mapa o arrastrando
          el marcador
        </p>
      </div>
      <MapboxMap
        latitude={ubicacion.latitud}
        longitude={ubicacion.longitud}
        onLocationChange={onUbicacionChange}
        className="h-48 w-full rounded-xl border border-blue-200"
      />
    </div>
  );
}
