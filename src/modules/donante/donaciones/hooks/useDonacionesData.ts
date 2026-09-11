import { useState, useCallback } from 'react';
import { actualizarDonacionAction, cancelarDonacionAction, fetchMisDonacionesAction } from '../actions';
import { sendNotification } from '@/modules/shared/services/notificationClient';
import type { Donacion, MotivoCancelacion } from '../types';

export function useDonacionesData(user: { id: string } | null) {
  const [donaciones, setDonaciones] = useState<Donacion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);

  const cargarDonaciones = useCallback(async () => {
    if (!user) return;

    setCargando(true);
    setMensaje('');

    const result = await fetchMisDonacionesAction();
    if (result.success) {
      setDonaciones(result.data);
    } else {
      setMensaje(result.error ?? 'Error al cargar donaciones');
    }
    setCargando(false);
  }, [user]);

  const cancelarDonacion = useCallback(async (id: number, motivo: MotivoCancelacion, observaciones?: string): Promise<Donacion | null> => {
    setCancelandoId(id);
    try {
      const result = await cancelarDonacionAction(id, motivo, observaciones);
      if (!result.success || !result.data) {
        setMensaje(result.error ?? 'Error al cancelar donación');
        return null;
      }

      setDonaciones((prev) => prev.map((d) => (d.id === id ? result.data! : d)));
      setMensaje('Donación cancelada exitosamente');
      setTimeout(() => setMensaje(''), 3000);
      void sendNotification({ event: 'donation_status_changed', entityId: String(id) });
      return result.data;
    } finally {
      setCancelandoId(null);
    }
  }, []);

  const actualizarDonacion = useCallback(async (donacion: Donacion): Promise<boolean> => {
    const result = await actualizarDonacionAction(donacion);
    if (result.success) {
      setDonaciones((prev) => prev.map((d) => (d.id === donacion.id ? donacion : d)));
      setMensaje('Donación actualizada exitosamente');
      setTimeout(() => setMensaje(''), 3000);
      return true;
    }

    setMensaje(result.error ?? 'Error al actualizar donación');
    return false;
  }, []);

  return { donaciones, cargando, mensaje, cancelandoId, cargarDonaciones, cancelarDonacion, actualizarDonacion };
}
