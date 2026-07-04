import { useState, useCallback, useMemo } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NuevaDonacionService } from '../services/nuevaDonacionService';
import { DonacionFormulario } from '../../donaciones/types';
import { ProductoSeleccionado, ImpactoCalculado, Alimento } from '../types';

interface UserProfile {
  nombre?: string;
  telefono?: string;
  email?: string;
  ruc?: string;
  cedula?: string;
  direccion?: string;
  tipo_persona?: string;
  representante?: string;
}

export function useNuevaDonacionSubmit(
  supabase: SupabaseClient,
  user: User | null,
  userProfile: UserProfile | null
) {
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const service = useMemo(() => new NuevaDonacionService(supabase), [supabase]);

  const enviarDonacion = useCallback(
    async (
      formulario: DonacionFormulario,
      impacto: ImpactoCalculado,
      productoInfo: ProductoSeleccionado | null,
      unidadInfo: { id: number; nombre: string; simbolo: string } | null,
      alimentos: Alimento[]
    ): Promise<boolean> => {
      if (!user) {
        setMensaje('Usuario no autenticado');
        return false;
      }

      setEnviando(true);
      setMensaje('');

      try {
        await service.crearDonacion(
          formulario,
          impacto,
          productoInfo,
          unidadInfo,
          alimentos,
          user.id,
          userProfile
        );

        setMensaje('¡Donación registrada exitosamente! Gracias por tu contribución.');
        setTimeout(() => setMensaje(''), 5000);
        return true;
      } catch (error: unknown) {
        setMensaje(error instanceof Error ? error.message : 'Error al registrar la donación');
        console.error('Error al enviar donación:', error);
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [service, user, userProfile]
  );

  const limpiarMensaje = useCallback(() => {
    setMensaje('');
  }, []);

  return {
    enviando,
    mensaje,
    enviarDonacion,
    limpiarMensaje,
  };
}
