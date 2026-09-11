import { useState, useCallback } from 'react';
import { crearDonacionAction } from '../actions';
import type { DonacionFormulario } from '../../donaciones/types';
import type { ProductoSeleccionado, ImpactoCalculado, Alimento } from '../types';

export function useNuevaDonacionSubmit(user: { id: string } | null) {
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const enviarDonacion = useCallback(
    async (
      formulario: DonacionFormulario,
      impacto: ImpactoCalculado,
      productoInfo: ProductoSeleccionado | null,
      unidadInfo: { id: number; nombre: string; simbolo: string } | null,
      alimentos: Alimento[],
    ): Promise<boolean> => {
      if (!user) {
        setMensaje('Usuario no autenticado');
        return false;
      }

      setEnviando(true);
      setMensaje('');

      try {
        const result = await crearDonacionAction(formulario, impacto, productoInfo, unidadInfo, alimentos);

        setMensaje(result.message);
        if (result.success) {
          setTimeout(() => setMensaje(''), 5000);
        }
        return result.success;
      } catch (error: unknown) {
        setMensaje(error instanceof Error ? error.message : 'Error al registrar la donación');
        console.error('Error al enviar donación:', error);
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [user],
  );

  const limpiarMensaje = useCallback(() => setMensaje(''), []);

  return { enviando, mensaje, enviarDonacion, limpiarMensaje };
}
