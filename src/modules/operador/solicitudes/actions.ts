'use server';

import { desc, eq } from 'drizzle-orm';
import { withRlsContext } from '@/db/client';
import { historialDonaciones, usuarios } from '@/db/schema';
import { requireRole } from '@/lib/server-auth';
import { parseUuidValue } from '@/lib/validation-core';
import type { HistorialDonacion } from './services/historialDonacionesService';

export async function fetchHistorialDonacionesAction(solicitudId: string): Promise<HistorialDonacion[]> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) return [];

  const parsedSolicitudId = parseUuidValue(solicitudId, { name: 'solicitudId' });
  if (!parsedSolicitudId.success) return [];

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const rows = await tx
        .select({
          id: historialDonaciones.id,
          solicitudId: historialDonaciones.solicitudId,
          cantidadEntregada: historialDonaciones.cantidadEntregada,
          porcentajeEntregado: historialDonaciones.porcentajeEntregado,
          cantidadSolicitada: historialDonaciones.cantidadSolicitada,
          operadorId: historialDonaciones.operadorId,
          comentario: historialDonaciones.comentario,
          createdAt: historialDonaciones.createdAt,
          operadorNombre: usuarios.nombre,
          operadorRol: usuarios.rol,
        })
        .from(historialDonaciones)
        .leftJoin(usuarios, eq(historialDonaciones.operadorId, usuarios.id))
        .where(eq(historialDonaciones.solicitudId, parsedSolicitudId.value))
        .orderBy(desc(historialDonaciones.createdAt));

      return rows.map((row) => ({
        id: row.id,
        solicitud_id: row.solicitudId,
        cantidad_entregada: Number(row.cantidadEntregada),
        porcentaje_entregado: Number(row.porcentajeEntregado),
        cantidad_solicitada: Number(row.cantidadSolicitada),
        operador_id: row.operadorId,
        comentario: row.comentario,
        created_at: row.createdAt.toISOString(),
        operador: row.operadorNombre ? { nombre: row.operadorNombre, rol: row.operadorRol ?? '' } : undefined,
      }));
    } catch (error) {
      console.error('Error obteniendo historial de donaciones:', error);
      return [];
    }
  });
}
