import { useMemo } from 'react';

interface Donacion {
  estado: 'Pendiente' | 'Aprobada' | 'Cancelada';
  impacto_estimado_personas?: number;
}

interface DonationStats {
  total: number;
  pendientes: number;
  aprobadas: number;
  canceladas: number;
  impactoTotal: number;
}

export function useDonationStats(donaciones: Donacion[]): DonationStats {
  const estadisticas = useMemo(() => {
    return {
      total: donaciones.length,
      pendientes: donaciones.filter(d => d.estado === 'Pendiente').length,
      aprobadas: donaciones.filter(d => d.estado === 'Aprobada').length,
      canceladas: donaciones.filter(d => d.estado === 'Cancelada').length,
      impactoTotal: donaciones.reduce((acc, d) => acc + (d.impacto_estimado_personas || 0), 0)
    };
  }, [donaciones]);

  return estadisticas;
}
