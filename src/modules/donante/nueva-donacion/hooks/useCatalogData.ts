import { useState, useEffect, useCallback } from 'react';
import { fetchCatalogoDonacionAction, type AlimentoConUnidades, type UnidadDisponible } from '../actions';

interface UnidadAlimento {
  unidad_id: number;
  nombre: string;
  simbolo: string;
  tipo_magnitud_id: number;
  tipo_magnitud_nombre: string;
  es_base: boolean;
  es_principal: boolean;
}

interface UseCatalogDataReturn {
  alimentos: AlimentoConUnidades[];
  unidades: UnidadDisponible[];
  cargandoAlimentos: boolean;
  cargandoUnidades: boolean;
  categoriasUnicas: string[];
  obtenerUnidadesAlimento: (alimentoId: number) => UnidadAlimento[];
}

export function useCatalogData(authLoading: boolean): UseCatalogDataReturn {
  const [alimentos, setAlimentos] = useState<AlimentoConUnidades[]>([]);
  const [unidades, setUnidades] = useState<UnidadDisponible[]>([]);
  const [cargandoAlimentos, setCargandoAlimentos] = useState(true);
  const [cargandoUnidades, setCargandoUnidades] = useState(true);

  const cargarCatalogo = useCallback(async () => {
    setCargandoAlimentos(true);
    setCargandoUnidades(true);
    try {
      const result = await fetchCatalogoDonacionAction();
      if (result.success) {
        setAlimentos(result.alimentos);
        setUnidades(result.unidades);
      } else {
        console.error('Error al cargar catálogo:', result.error);
      }
    } finally {
      setCargandoAlimentos(false);
      setCargandoUnidades(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) {
      void cargarCatalogo();
    }
  }, [authLoading, cargarCatalogo]);

  const categoriasUnicas = [...new Set(alimentos.map((a) => a.categoria))].sort();

  const obtenerUnidadesAlimento = (alimentoId: number): UnidadAlimento[] => {
    const alimento = alimentos.find((a) => a.id === alimentoId);
    return alimento?.unidades || [];
  };

  return { alimentos, unidades, cargandoAlimentos, cargandoUnidades, categoriasUnicas, obtenerUnidadesAlimento };
}
