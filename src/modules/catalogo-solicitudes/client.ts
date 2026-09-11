import { isPlainRecord, parseOptionalTextValue, parsePositiveIntegerArrayValue, parsePositiveIntegerValue, parseUuidValue } from '@/lib/validation-core';
import type { CatalogoSolicitudResult } from './types';

const MAX_UNIDADES_SOLICITUD = 50;

const readResponseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const getResponseError = (payload: unknown, fallback: string): string =>
  isPlainRecord(payload) && typeof payload.error === 'string' ? payload.error : fallback;

/**
 * Client-side call into `POST /api/admin/catalogo-solicitudes/aprobar` — kept
 * as an HTTP round-trip (rather than a Server Action) because approval runs
 * under `app_admin` (BYPASSRLS) via the `aprobar_solicitud_alta_alimento_server`
 * Postgres function, matching the old app's service-role-only RPC boundary.
 */
export async function aprobarSolicitudViaApi(input: {
  solicitudId: string;
  nombre: string;
  categoria: string;
  unidadIds: number[];
  unidadPrincipalId?: number;
}): Promise<CatalogoSolicitudResult<number>> {
  try {
    const solicitudId = parseUuidValue(input.solicitudId, { name: 'solicitudId' });
    if (!solicitudId.success) return { success: false, error: solicitudId.error };

    const unidadIdsResult = parsePositiveIntegerArrayValue(input.unidadIds, { name: 'unidadIds', min: 1, maxItems: MAX_UNIDADES_SOLICITUD });
    if (!unidadIdsResult.success) return { success: false, error: unidadIdsResult.error };

    const unidadPrincipal =
      input.unidadPrincipalId === undefined
        ? ({ success: true as const, value: undefined })
        : parsePositiveIntegerValue(input.unidadPrincipalId, { name: 'unidadPrincipalId', min: 1 });
    if (!unidadPrincipal.success) return { success: false, error: unidadPrincipal.error };

    const nombre = input.nombre.trim();
    const categoria = input.categoria.trim();
    if (!nombre || !categoria) return { success: false, error: 'Nombre y categoría son obligatorios' };

    const unidadIds = unidadIdsResult.value;
    if (unidadPrincipal.value !== undefined && !unidadIds.includes(unidadPrincipal.value)) {
      return { success: false, error: 'La unidad principal debe estar seleccionada' };
    }

    const response = await fetch('/api/admin/catalogo-solicitudes/aprobar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solicitudId: solicitudId.value, nombre, categoria, unidadIds, unidadPrincipalId: unidadPrincipal.value ?? null }),
    });
    const payload = await readResponseJson(response);

    if (!response.ok) {
      return { success: false, error: getResponseError(payload, 'No fue posible aprobar la solicitud'), errorDetails: payload };
    }

    const alimentoId = isPlainRecord(payload) ? Number(payload.alimentoId) : Number.NaN;
    if (!Number.isSafeInteger(alimentoId) || alimentoId <= 0) {
      return { success: false, error: 'La solicitud fue aprobada, pero la respuesta del alimento creado no es válida', errorDetails: payload };
    }

    return { success: true, data: alimentoId };
  } catch (err) {
    return { success: false, error: 'Error inesperado al aprobar la solicitud', errorDetails: err };
  }
}
