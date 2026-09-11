'use client';

import { useCallback, useState } from 'react';
import { updateCantidadInventarioAction } from '@/modules/operador/inventario/actions';
import type { InventarioItem } from '../types';
import { SYSTEM_MESSAGES } from '../constants';

interface UpdateResult {
  success: boolean;
  message: string;
}

interface UseInventoryActionsResult {
  processingId?: string;
  lastError?: string;
  updateCantidad: (item: InventarioItem, nuevaCantidad: number) => Promise<UpdateResult>;
}

export const useInventoryActions = (): UseInventoryActionsResult => {
  const [processingId, setProcessingId] = useState<string | undefined>();
  const [lastError, setLastError] = useState<string | undefined>();

  const updateCantidad = useCallback(async (item: InventarioItem, nuevaCantidad: number): Promise<UpdateResult> => {
    setProcessingId(item.id_entrada);
    setLastError(undefined);

    try {
      const result = await updateCantidadInventarioAction(item.id_entrada, nuevaCantidad);

      if (result.success) {
        const diferencia = nuevaCantidad - item.cantidad_disponible;
        const message =
          diferencia === 0
            ? 'No se realizaron cambios en la cantidad'
            : diferencia > 0
              ? `Inventario incrementado en ${diferencia} unidades.`
              : `Inventario reducido en ${Math.abs(diferencia)} unidades.`;
        return { success: true, message };
      }

      const message = result.error ?? SYSTEM_MESSAGES.loadError;
      setLastError(message);
      return { success: false, message };
    } finally {
      setProcessingId(undefined);
    }
  }, []);

  return { processingId, lastError, updateCantidad };
};
