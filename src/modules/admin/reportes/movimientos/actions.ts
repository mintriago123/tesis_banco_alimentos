'use server';

import { withRlsContext } from '@/db/client';
import { requireRole } from '@/lib/server-auth';
import { createMovementDataService } from './services/movementDataService';
import type { MovementItem } from './types';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export async function getAllMovementsAction(): Promise<ActionResult<MovementItem[]>> {
  const auth = await requireRole(['ADMINISTRADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const result = await createMovementDataService(tx).getAllMovements();
    return result.success && result.data
      ? { success: true as const, data: result.data }
      : { success: false as const, error: result.error ?? 'Error al cargar los datos de movimientos' };
  });
}
