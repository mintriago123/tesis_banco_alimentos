import { eq } from 'drizzle-orm';
import { solicitudes, unidades, usuarios } from '@/db/schema';
import type { Solicitud } from '../../types';
import { updateSolicitudById } from './solicitudStatePersistence';
import type { SolicitudActionResult, SolicitudUseCaseDeps } from './types';
import { parseUuidValue } from '@/lib/validation-core';

interface RevertSolicitudParams {
  solicitudId: string;
}

export const revertSolicitud = async (params: RevertSolicitudParams, deps: SolicitudUseCaseDeps): SolicitudActionResult => {
  const { solicitudId } = params;
  const parsedSolicitudId = parseUuidValue(solicitudId, { name: 'solicitudId' });
  if (!parsedSolicitudId.success) {
    return { success: false, error: parsedSolicitudId.error };
  }

  deps.logger.info(`Iniciando reversión de solicitud ${solicitudId}`);

  const [row] = await deps.db
    .select({
      id: solicitudes.id,
      usuarioId: solicitudes.usuarioId,
      tipoAlimento: solicitudes.tipoAlimento,
      cantidad: solicitudes.cantidad,
      comentarios: solicitudes.comentarios,
      estado: solicitudes.estado,
      createdAt: solicitudes.createdAt,
      latitud: solicitudes.latitud,
      longitud: solicitudes.longitud,
      fechaRespuesta: solicitudes.fechaRespuesta,
      comentarioAdmin: solicitudes.comentarioAdmin,
      unidadId: solicitudes.unidadId,
      codigoComprobante: solicitudes.codigoComprobante,
      unidadNombre: unidades.nombre,
      unidadSimbolo: unidades.simbolo,
      unidadTipoMagnitudId: unidades.tipoMagnitudId,
      unidadEsBase: unidades.esBase,
      usuarioNombre: usuarios.nombre,
      usuarioCedula: usuarios.cedula,
      usuarioTelefono: usuarios.telefono,
      usuarioEmail: usuarios.email,
      usuarioDireccion: usuarios.direccion,
      usuarioTipoPersona: usuarios.tipoPersona,
    })
    .from(solicitudes)
    .leftJoin(unidades, eq(solicitudes.unidadId, unidades.id))
    .leftJoin(usuarios, eq(solicitudes.usuarioId, usuarios.id))
    .where(eq(solicitudes.id, parsedSolicitudId.value))
    .limit(1);

  if (!row) {
    deps.logger.error('Error obteniendo solicitud para revertir', 'no encontrada');
    return { success: false, error: 'No fue posible obtener la información de la solicitud' };
  }

  const solicitud: Solicitud = {
    id: row.id,
    usuario_id: row.usuarioId,
    tipo_alimento: row.tipoAlimento ?? 'Producto desconocido',
    cantidad: Number(row.cantidad ?? 0),
    comentarios: row.comentarios ?? undefined,
    estado: row.estado as Solicitud['estado'],
    created_at: row.createdAt.toISOString(),
    latitud: row.latitud ?? undefined,
    longitud: row.longitud ?? undefined,
    fecha_respuesta: row.fechaRespuesta?.toISOString(),
    comentario_admin: row.comentarioAdmin ?? undefined,
    unidad_id: row.unidadId ?? undefined,
    codigo_comprobante: row.codigoComprobante ?? undefined,
    unidades: row.unidadId
      ? {
          id: row.unidadId,
          nombre: row.unidadNombre ?? '',
          simbolo: row.unidadSimbolo ?? '',
          tipo_magnitud_id: row.unidadTipoMagnitudId ?? 0,
          es_base: row.unidadEsBase ?? false,
        }
      : null,
    usuarios: row.usuarioNombre
      ? {
          nombre: row.usuarioNombre ?? 'N/A',
          cedula: row.usuarioCedula ?? 'N/A',
          telefono: row.usuarioTelefono ?? 'N/A',
          email: row.usuarioEmail ?? undefined,
          direccion: row.usuarioDireccion ?? undefined,
          tipo_persona: row.usuarioTipoPersona ?? undefined,
        }
      : null,
  };

  if (solicitud.estado !== 'aprobada') {
    deps.logger.warn(`Intento de revertir solicitud que no está aprobada. Estado actual: ${solicitud.estado}`);

    if (solicitud.estado === 'entregada') {
      return { success: false, error: 'No se pueden revertir solicitudes que ya fueron entregadas. Este cambio es permanente.' };
    }

    return { success: false, error: 'Solo se pueden revertir solicitudes que estén en estado aprobada' };
  }

  const movimientosEgreso = await deps.movementService.obtenerMovimientosEgresoSolicitud(solicitud);

  if (movimientosEgreso.length > 0) {
    deps.logger.info(`Se encontraron ${movimientosEgreso.length} movimientos de egreso para restaurar`);

    const resultadoRestauracion = await deps.inventoryService.restaurarInventario(movimientosEgreso);

    if (resultadoRestauracion.error) {
      deps.logger.error('Error restaurando inventario', resultadoRestauracion.error);
      return {
        success: false,
        error: `No fue posible restaurar el inventario: ${resultadoRestauracion.error}`,
        errorDetails: resultadoRestauracion.errorDetails,
      };
    }

    const movimientoResult = await deps.movementService.registrarMovimientoReversion(solicitud, movimientosEgreso);

    if (!movimientoResult.success) {
      return { success: false, error: movimientoResult.error ?? 'No fue posible registrar el movimiento de reversión', errorDetails: movimientoResult.errorDetails };
    }

    deps.logger.info('Inventario restaurado y movimiento de ingreso registrado exitosamente');
  } else {
    deps.logger.warn('No se encontraron movimientos de egreso relacionados con la solicitud. Continuando con la reversión del estado únicamente.');
  }

  const { error: updateError } = await updateSolicitudById(deps.db, parsedSolicitudId.value, {
    estado: 'pendiente',
    fecha_respuesta: null,
  });

  if (updateError) {
    deps.logger.error('Error al revertir solicitud', updateError);
    return { success: false, error: 'No fue posible revertir la solicitud', errorDetails: updateError };
  }

  const mensaje =
    movimientosEgreso.length > 0
      ? 'Solicitud revertida a pendiente exitosamente. El inventario ha sido restaurado.'
      : 'Solicitud revertida a pendiente exitosamente. No se encontraron movimientos de egreso para restaurar.';

  return {
    success: true,
    data: { success: true, message: mensaje, warning: movimientosEgreso.length === 0 },
  };
};
