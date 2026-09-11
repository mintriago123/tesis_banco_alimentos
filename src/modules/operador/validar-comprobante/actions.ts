'use server';

import { eq } from 'drizzle-orm';
import { withRlsContext } from '@/db/client';
import { donaciones, solicitudes, unidades, usuarios } from '@/db/schema';
import { requireRole } from '@/lib/server-auth';
import { updateSolicitudEstadoAction } from '@/modules/admin/reportes/solicitudes/actions';

export interface SolicitudResult {
  tipo: 'solicitud';
  id: string;
  usuario_id: string;
  tipo_alimento: string;
  cantidad: number;
  estado: string;
  created_at: string;
  fecha_respuesta: string | null;
  comentario_admin: string | null;
  codigo_comprobante: string;
  unidades: { nombre: string; simbolo: string } | null;
  usuarios: { nombre: string; cedula: string; telefono: string; email: string; direccion: string } | null;
}

export interface DonacionResult {
  tipo: 'donacion';
  id: number;
  user_id: string | null;
  nombre_donante: string;
  cedula_donante: string | null;
  ruc_donante: string | null;
  telefono: string;
  email: string;
  tipo_producto: string;
  cantidad: number;
  unidad_simbolo: string | null;
  estado: string;
  creado_en: string;
  actualizado_en: string;
  codigo_comprobante: string;
  direccion_donante_completa: string | null;
}

export type SearchResult = SolicitudResult | DonacionResult;

export async function buscarComprobantePorCodigoAction(codigo: string): Promise<{ success: true; data: SearchResult } | { success: false; error: string }> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  const codigoNormalizado = codigo.trim().toUpperCase();

  return withRlsContext(auth.profile.id, async (tx) => {
    const [solicitud] = await tx
      .select({
        id: solicitudes.id,
        usuario_id: solicitudes.usuarioId,
        tipo_alimento: solicitudes.tipoAlimento,
        cantidad: solicitudes.cantidad,
        estado: solicitudes.estado,
        created_at: solicitudes.createdAt,
        fecha_respuesta: solicitudes.fechaRespuesta,
        comentario_admin: solicitudes.comentarioAdmin,
        codigo_comprobante: solicitudes.codigoComprobante,
        unidadNombre: unidades.nombre,
        unidadSimbolo: unidades.simbolo,
        usuarioNombre: usuarios.nombre,
        usuarioCedula: usuarios.cedula,
        usuarioTelefono: usuarios.telefono,
        usuarioEmail: usuarios.email,
        usuarioDireccion: usuarios.direccion,
      })
      .from(solicitudes)
      .leftJoin(unidades, eq(solicitudes.unidadId, unidades.id))
      .leftJoin(usuarios, eq(solicitudes.usuarioId, usuarios.id))
      .where(eq(solicitudes.codigoComprobante, codigoNormalizado))
      .limit(1);

    if (solicitud) {
      const data: SolicitudResult = {
        tipo: 'solicitud',
        id: solicitud.id,
        usuario_id: solicitud.usuario_id,
        tipo_alimento: solicitud.tipo_alimento,
        cantidad: Number(solicitud.cantidad),
        estado: solicitud.estado,
        created_at: solicitud.created_at.toISOString(),
        fecha_respuesta: solicitud.fecha_respuesta?.toISOString() ?? null,
        comentario_admin: solicitud.comentario_admin,
        codigo_comprobante: solicitud.codigo_comprobante ?? codigoNormalizado,
        unidades: solicitud.unidadNombre ? { nombre: solicitud.unidadNombre, simbolo: solicitud.unidadSimbolo ?? '' } : null,
        usuarios: solicitud.usuarioNombre
          ? { nombre: solicitud.usuarioNombre, cedula: solicitud.usuarioCedula ?? '', telefono: solicitud.usuarioTelefono ?? '', email: solicitud.usuarioEmail ?? '', direccion: solicitud.usuarioDireccion ?? '' }
          : null,
      };
      return { success: true, data };
    }

    const [donacion] = await tx.select().from(donaciones).where(eq(donaciones.codigoComprobante, codigoNormalizado)).limit(1);

    if (donacion) {
      const data: DonacionResult = {
        tipo: 'donacion',
        id: donacion.id,
        user_id: donacion.userId,
        nombre_donante: donacion.nombreDonante,
        cedula_donante: donacion.cedulaDonante,
        ruc_donante: donacion.rucDonante,
        telefono: donacion.telefono,
        email: donacion.email,
        tipo_producto: donacion.tipoProducto,
        cantidad: Number(donacion.cantidad),
        unidad_simbolo: donacion.unidadSimbolo,
        estado: donacion.estado,
        creado_en: donacion.creadoEn.toISOString(),
        actualizado_en: donacion.actualizadoEn.toISOString(),
        codigo_comprobante: donacion.codigoComprobante ?? codigoNormalizado,
        direccion_donante_completa: donacion.direccionDonanteCompleta,
      };
      return { success: true, data };
    }

    return { success: false, error: 'No se encontró ningún registro con ese código de comprobante' };
  });
}

export async function marcarSolicitudEntregadaAction(solicitudId: string, codigoComprobanteVerificado: string) {
  return updateSolicitudEstadoAction({ solicitudId, nuevoEstado: 'entregada', codigoComprobanteVerificado });
}

/**
 * Ports the old page's raw `.update({estado:'Aprobada'})` on `donaciones` —
 * the DB trigger (`trigger_crear_producto`) still fires on this update and
 * creates the inventory lot, exactly as it did before. The fuller
 * approve/cancel workflow for donations (`admin/reportes/donaciones`) is a
 * separate, larger module out of this task's scope — this stays a narrow,
 * faithful port of only what this one page already did.
 */
export async function marcarDonacionAprobadaAction(donacionId: number): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  try {
    await withRlsContext(auth.profile.id, async (tx) => {
      await tx.update(donaciones).set({ estado: 'Aprobada', actualizadoEn: new Date() }).where(eq(donaciones.id, donacionId));
    });
    return { success: true };
  } catch (error) {
    console.error('Error actualizando donación:', error);
    return { success: false, error: 'Error al actualizar el estado' };
  }
}
