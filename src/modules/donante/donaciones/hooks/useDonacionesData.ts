import { useState, useCallback, useMemo } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { DonacionesService } from '../services/donacionesService';
import type { Donacion, MotivoCancelacion } from '../types';

export function useDonacionesData(supabase: SupabaseClient, user: User | null) {
  const [donaciones, setDonaciones] = useState<Donacion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);

  const service = useMemo(() => new DonacionesService(supabase), [supabase]);

  const cargarDonaciones = useCallback(async () => {
    if (!user) return;

    setCargando(true);
    setMensaje('');
    
    try {
      const data = await service.obtenerDonaciones(user.id);
      setDonaciones(data);
    } catch (error: unknown) {
      setMensaje(error instanceof Error ? error.message : 'Error al cargar donaciones');
      console.error('Error al cargar donaciones:', error);
    } finally {
      setCargando(false);
    }
  }, [user, service]);

  const cancelarDonacion = useCallback(async (
    id: number,
    motivo: MotivoCancelacion,
    observaciones?: string,
  ): Promise<Donacion | null> => {
    setCancelandoId(id);
    try {
      const donacionCancelada = await service.cancelarDonacion(id, motivo, observaciones);
      setDonaciones(prev => prev.map(d => d.id === id ? donacionCancelada : d));
      setMensaje('Donación cancelada exitosamente');
      setTimeout(() => setMensaje(''), 3000);
      return donacionCancelada;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al cancelar donación';
      setMensaje(message);
      console.error('Error al cancelar donación', { donacionId: id, result: 'error' });
      return null;
    } finally {
      setCancelandoId(null);
    }
  }, [service]);

  const actualizarDonacion = useCallback(async (donacion: Donacion): Promise<boolean> => {
    try {
      await service.actualizarDonacion(donacion);
      setDonaciones(prev =>
        prev.map(d => (d.id === donacion.id ? donacion : d))
      );
      setMensaje('Donación actualizada exitosamente');
      setTimeout(() => setMensaje(''), 3000);
      return true;
    } catch (error: unknown) {
      setMensaje(error instanceof Error ? error.message : 'Error al actualizar donación');
      console.error('Error al actualizar:', error);
      return false;
    }
  }, [service]);

  return {
    donaciones,
    cargando,
    mensaje,
    cancelandoId,
    cargarDonaciones,
    cancelarDonacion,
    actualizarDonacion,
  };
}
