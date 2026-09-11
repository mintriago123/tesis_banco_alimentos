/**
 * @fileoverview Hook para ejecutar acciones sobre solicitudes.
 */

import { useCallback, useState } from 'react';
import type { Solicitud, SolicitudActionResponse } from '../types';
import { procesarDonacionAction, revertirSolicitudAction, updateSolicitudEstadoAction } from '../actions';
import { SYSTEM_MESSAGES } from '../constants';

interface UseSolicitudActionsResult {
  processingId?: string;
  lastError?: string;
  updateEstado: (
    solicitud: Solicitud,
    nuevoEstado: 'aprobada' | 'rechazada' | 'entregada',
    comentario?: string,
    motivoRechazo?: string,
    codigoComprobanteVerificado?: string,
    depositoId?: string,
    cantidadAprobada?: number,
  ) => Promise<SolicitudActionResponse>;
  revertir: (solicitudId: string) => Promise<SolicitudActionResponse>;
  procesarDonacion: (solicitud: Solicitud, cantidad: number, porcentaje: number, comentario?: string, depositoId?: string) => Promise<SolicitudActionResponse>;
}

export const useSolicitudActions = (): UseSolicitudActionsResult => {
  const [processingId, setProcessingId] = useState<string | undefined>();
  const [lastError, setLastError] = useState<string | undefined>();

  const updateEstado = useCallback(
    async (
      solicitud: Solicitud,
      nuevoEstado: 'aprobada' | 'rechazada' | 'entregada',
      comentario?: string,
      motivoRechazo?: string,
      codigoComprobanteVerificado?: string,
      depositoId?: string,
      cantidadAprobada?: number,
    ) => {
      setProcessingId(solicitud.id);
      setLastError(undefined);

      try {
        const result = await updateSolicitudEstadoAction({
          solicitudId: solicitud.id,
          nuevoEstado,
          comentarioAdmin: comentario,
          motivoRechazo,
          codigoComprobanteVerificado,
          depositoId,
          cantidadAprobada,
        });

        if (result.success) {
          return result.data;
        }

        const message = result.error ?? SYSTEM_MESSAGES.actionError;
        setLastError(message);
        return { success: false, message, warning: false };
      } finally {
        setProcessingId(undefined);
      }
    },
    [],
  );

  const revertir = useCallback(async (solicitudId: string) => {
    setProcessingId(solicitudId);
    setLastError(undefined);

    try {
      const result = await revertirSolicitudAction(solicitudId);

      if (result.success) {
        return result.data;
      }

      const message = result.error ?? SYSTEM_MESSAGES.actionError;
      setLastError(message);
      return { success: false, message };
    } finally {
      setProcessingId(undefined);
    }
  }, []);

  const procesarDonacion = useCallback(async (solicitud: Solicitud, cantidad: number, porcentaje: number, comentario?: string, depositoId?: string) => {
    setProcessingId(solicitud.id);
    setLastError(undefined);

    try {
      const result = await procesarDonacionAction({ solicitudId: solicitud.id, cantidadDonar: cantidad, porcentaje, comentario, depositoId });

      if (result.success) {
        return result.data;
      }

      const message = result.error ?? SYSTEM_MESSAGES.actionError;
      setLastError(message);
      return { success: false, message, warning: false };
    } finally {
      setProcessingId(undefined);
    }
  }, []);

  return { processingId, lastError, updateEstado, revertir, procesarDonacion };
};
