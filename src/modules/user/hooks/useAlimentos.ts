import { useState, useEffect, useCallback } from 'react';
import type { Alimento, LoadingState, UnidadAlimento } from '../types';
import { fetchAlimentosConStockAction } from '../actions';

interface UseAlimentosResult {
  alimentos: Alimento[];
  alimentosFiltrados: Alimento[];
  categorias: string[];
  loading: LoadingState;
  error: string | null;
  busqueda: string;
  filtroCategoria: string;
  setBusqueda: (busqueda: string) => void;
  setFiltroCategoria: (categoria: string) => void;
  filtrarAlimentos: (termino: string, categoria?: string) => void;
  obtenerUnidadesAlimento: (alimentoId: number) => UnidadAlimento[];
}

export function useAlimentos(): UseAlimentosResult {
  const [alimentos, setAlimentos] = useState<Alimento[]>([]);
  const [alimentosFiltrados, setAlimentosFiltrados] = useState<Alimento[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading('loading');
      setError(null);

      const result = await fetchAlimentosConStockAction();
      if (cancelled) return;

      if (!result.success) {
        setError('Error al cargar los alimentos disponibles');
        setLoading('error');
        return;
      }

      setAlimentos(result.data);
      setAlimentosFiltrados(result.data);

      const categoriasUnicas = [...new Set(result.data.map((alimento) => alimento.categoria).filter(Boolean))].sort();
      setCategorias(categoriasUnicas);
      setLoading('success');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtrarAlimentos = useCallback(
    (termino: string, categoria: string = filtroCategoria) => {
      let filtrados = alimentos;

      if (termino.trim()) {
        const terminoLower = termino.toLowerCase();
        filtrados = filtrados.filter((alimento) => alimento.nombre.toLowerCase().includes(terminoLower) || alimento.categoria.toLowerCase().includes(terminoLower));
      }

      if (categoria) {
        filtrados = filtrados.filter((alimento) => alimento.categoria.toLowerCase() === categoria.toLowerCase());
      }

      setAlimentosFiltrados(filtrados);
    },
    [alimentos, filtroCategoria],
  );

  const obtenerUnidadesAlimento = useCallback(
    (alimentoId: number): UnidadAlimento[] => {
      const alimento = alimentos.find((a) => a.id === alimentoId);
      return alimento?.unidades || [];
    },
    [alimentos],
  );

  return {
    alimentos,
    alimentosFiltrados,
    categorias,
    loading,
    error,
    busqueda,
    filtroCategoria,
    setBusqueda,
    setFiltroCategoria,
    filtrarAlimentos,
    obtenerUnidadesAlimento,
  };
}
