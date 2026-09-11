'use server';

import { revalidatePath } from 'next/cache';
import { withRlsContext } from '@/db/client';
import { requireRole } from '@/lib/server-auth';
import { createOperadorInventoryDataService } from './services/inventoryDataService';
import type { AlertaInventario, Deposito, InventarioItem, OperadorInventarioStats } from './types';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function withInventoryService<T>(fn: (service: ReturnType<typeof createOperadorInventoryDataService>) => Promise<{ success: boolean; data?: T; error?: string }>): Promise<ActionResult<T>> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) return { success: false, error: 'No autorizado' };

  return withRlsContext(auth.profile.id, async (tx) => {
    const service = createOperadorInventoryDataService(tx, auth.profile.id);
    const result = await fn(service);
    return result.success && result.data !== undefined
      ? { success: true as const, data: result.data }
      : { success: false as const, error: result.error ?? 'Error' };
  });
}

export async function fetchInventarioAction(): Promise<ActionResult<InventarioItem[]>> {
  return withInventoryService((service) => service.fetchInventario());
}

export async function fetchProductosConAlertasAction(): Promise<ActionResult<InventarioItem[]>> {
  return withInventoryService((service) => service.fetchProductosConAlertas());
}

export async function fetchOperadorStatsAction(): Promise<ActionResult<OperadorInventarioStats>> {
  return withInventoryService((service) => service.fetchOperadorStats());
}

export async function fetchDepositosAction(): Promise<ActionResult<Deposito[]>> {
  return withInventoryService((service) => service.fetchDepositos());
}

export async function fetchAlertasInventarioAction(): Promise<ActionResult<AlertaInventario[]>> {
  return withInventoryService((service) => service.fetchAlertas());
}

export async function updateCantidadInventarioAction(idEntrada: string, nuevaCantidad: number): Promise<ActionResult<undefined>> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) return { success: false, error: 'No autorizado' };

  return withRlsContext(auth.profile.id, async (tx) => {
    const service = createOperadorInventoryDataService(tx, auth.profile.id);
    const result = await service.updateCantidad(idEntrada, nuevaCantidad);

    if (result.success) {
      revalidatePath('/operador/inventario');
      revalidatePath('/admin/reportes/inventario');
      return { success: true, data: undefined };
    }

    return { success: false, error: result.error ?? 'No fue posible actualizar la cantidad' };
  });
}
