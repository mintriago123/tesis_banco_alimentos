import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

interface UnidadAlimento {
  unidad_id: number;
  nombre: string;
  simbolo: string;
  tipo_magnitud_id: number;
  tipo_magnitud_nombre: string;
  es_base: boolean;
  es_principal: boolean;
}

interface Alimento {
  id: number;
  nombre: string;
  categoria: string;
  unidades?: UnidadAlimento[];
}

interface Unidad {
  id: number;
  nombre: string;
  simbolo: string;
  tipo_magnitud_id?: number;
  es_base?: boolean;
  activa?: boolean;
  es_discreta?: boolean;
  es_presentacion?: boolean;
  permite_fraccion?: boolean;
  es_convertible?: boolean;
}

interface UseCatalogDataReturn {
  alimentos: Alimento[];
  unidades: Unidad[];
  cargandoAlimentos: boolean;
  cargandoUnidades: boolean;
  categoriasUnicas: string[];
  obtenerUnidadesAlimento: (alimentoId: number) => UnidadAlimento[];
}

export function useCatalogData(supabase: SupabaseClient | null, authLoading: boolean): UseCatalogDataReturn {
  const [alimentos, setAlimentos] = useState<Alimento[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [cargandoAlimentos, setCargandoAlimentos] = useState(true);
  const [cargandoUnidades, setCargandoUnidades] = useState(true);

  const cargarAlimentos = useCallback(async () => {
    if (!supabase) return;
    
    try {
      setCargandoAlimentos(true);
      
      // Cargar alimentos
      const { data: alimentosData, error: alimentosError } = await supabase
        .from('alimentos')
        .select('id, nombre, categoria')
        .order('nombre');

      if (alimentosError) throw alimentosError;

      // Cargar unidades de cada alimento
      const alimentosConUnidades = await Promise.all(
        (alimentosData || []).map(async (alimento) => {
          const { data: unidadesData, error: unidadesError } = await supabase
            .rpc('obtener_unidades_alimento', { p_alimento_id: alimento.id });

          if (unidadesError) {
            console.error(`Error al cargar unidades para alimento ${alimento.id}:`, unidadesError);
            return {
              ...alimento,
              unidades: []
            };
          }

          return {
            ...alimento,
            unidades: (unidadesData || []) as UnidadAlimento[]
          };
        })
      );

      setAlimentos(alimentosConUnidades);
    } catch (error) {
      console.error('Error al cargar alimentos:', error);
    } finally {
      setCargandoAlimentos(false);
    }
  }, [supabase]);

  const cargarUnidades = useCallback(async () => {
    if (!supabase) return;
    
    try {
      setCargandoUnidades(true);
      const { data, error } = await supabase
        .from('unidades')
        .select('id, nombre, simbolo, tipo_magnitud_id, es_base, activa, es_discreta, es_presentacion, permite_fraccion')
        .eq('activa', true)
        .order('nombre');

      if (error) throw error;

      const { data: conversiones, error: conversionesError } = await supabase
        .from('conversiones')
        .select('unidad_origen_id, unidad_destino_id')
        .eq('activo', true);

      if (conversionesError) throw conversionesError;

      const unidadesConvertibles = new Set(
        (conversiones ?? []).flatMap(conversion => [
          conversion.unidad_origen_id,
          conversion.unidad_destino_id,
        ])
      );

      setUnidades(
        (data ?? []).map(unidad => ({
          ...unidad,
          es_convertible: unidadesConvertibles.has(unidad.id),
        }))
      );
    } catch (error) {
      console.error('Error al cargar unidades:', error);
    } finally {
      setCargandoUnidades(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!authLoading && supabase) {
      cargarAlimentos();
      cargarUnidades();
    }
  }, [supabase, authLoading, cargarAlimentos, cargarUnidades]);

  // Obtener categorías únicas
  const categoriasUnicas = [...new Set(alimentos.map(a => a.categoria))].sort();

  // Función para obtener unidades de un alimento específico
  const obtenerUnidadesAlimento = (alimentoId: number): UnidadAlimento[] => {
    const alimento = alimentos.find(a => a.id === alimentoId);
    return alimento?.unidades || [];
  };

  return {
    alimentos,
    unidades,
    cargandoAlimentos,
    cargandoUnidades,
    categoriasUnicas,
    obtenerUnidadesAlimento,
  };
}
