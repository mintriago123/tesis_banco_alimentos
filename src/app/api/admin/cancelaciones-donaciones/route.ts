/**
 * @fileoverview API para consultar historial de cancelaciones de donaciones
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { withRlsContext } from '@/db/client';
import { donaciones, usuarios } from '@/db/schema';
import type { DonacionCanceladaDetalle, EstadisticasCancelaciones, MotivoCancelacion } from '@/modules/admin/reportes/cancelaciones/types';
import { parseBooleanParam, parseEnumParam, parseIsoDateParam, parsePaginationParams } from '@/lib/api-validation';
import { requireRole } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

const MOTIVOS_CANCELACION_FILTRO = [
  'todos',
  'error_donante',
  'no_disponible',
  'calidad_inadecuada',
  'logistica_imposible',
  'duplicado',
  'solicitud_donante',
  'otro',
] as const;

const MOTIVOS: MotivoCancelacion[] = [
  'error_donante',
  'no_disponible',
  'calidad_inadecuada',
  'logistica_imposible',
  'duplicado',
  'solicitud_donante',
  'otro',
];

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['ADMINISTRADOR']);
    if (authResult.response) {
      return authResult.response;
    }

    const searchParams = request.nextUrl.searchParams;
    const motivo = parseEnumParam(searchParams.get('motivo'), MOTIVOS_CANCELACION_FILTRO, { name: 'motivo', fallback: 'todos' });
    if (!motivo.success) return motivo.response;

    const fechaInicio = parseIsoDateParam(searchParams.get('fecha_inicio'), { name: 'fecha_inicio' });
    if (!fechaInicio.success) return fechaInicio.response;

    const fechaFin = parseIsoDateParam(searchParams.get('fecha_fin'), { name: 'fecha_fin' });
    if (!fechaFin.success) return fechaFin.response;

    if (fechaInicio.value && fechaFin.value && new Date(fechaInicio.value) > new Date(fechaFin.value)) {
      return NextResponse.json({ error: 'fecha_inicio no puede ser posterior a fecha_fin.' }, { status: 400 });
    }

    const pagination = parsePaginationParams(searchParams, { defaultLimit: 50, maxLimit: 200 });
    if (!pagination.success) return pagination.response;

    const incluirEstadisticas = parseBooleanParam(searchParams.get('estadisticas'), { name: 'estadisticas', fallback: false });
    if (!incluirEstadisticas.success) return incluirEstadisticas.response;

    const { limit, offset } = pagination.value;

    return withRlsContext(authResult.profile.id, async (tx) => {
      const conditions = [eq(donaciones.estado, 'Cancelada')];
      if (motivo.value !== 'todos') {
        conditions.push(eq(donaciones.motivoCancelacion, motivo.value));
      }
      if (fechaInicio.value) {
        conditions.push(gte(donaciones.fechaCancelacion, new Date(fechaInicio.value)));
      }
      if (fechaFin.value) {
        const fechaFinAjustada = new Date(fechaFin.value);
        fechaFinAjustada.setDate(fechaFinAjustada.getDate() + 1);
        conditions.push(lt(donaciones.fechaCancelacion, fechaFinAjustada));
      }
      const where = and(...conditions);

      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(donaciones).where(where);

      const cancelaciones = await tx
        .select({
          id: donaciones.id,
          user_id: donaciones.userId,
          nombre_donante: donaciones.nombreDonante,
          tipo_producto: donaciones.tipoProducto,
          cantidad: donaciones.cantidad,
          unidad_nombre: donaciones.unidadNombre,
          unidad_simbolo: donaciones.unidadSimbolo,
          estado: donaciones.estado,
          motivo_cancelacion: donaciones.motivoCancelacion,
          observaciones_cancelacion: donaciones.observacionesCancelacion,
          usuario_cancelacion_id: donaciones.usuarioCancelacionId,
          fecha_cancelacion: donaciones.fechaCancelacion,
          fecha_disponible: donaciones.fechaDisponible,
          creado_en: donaciones.creadoEn,
          categoria_comida: donaciones.categoriaComida,
          direccion_entrega: donaciones.direccionEntrega,
          telefono: donaciones.telefono,
          email: donaciones.email,
          impacto_estimado_personas: donaciones.impactoEstimadoPersonas,
          codigo_comprobante: donaciones.codigoComprobante,
        })
        .from(donaciones)
        .where(where)
        .orderBy(desc(donaciones.fechaCancelacion))
        .limit(limit)
        .offset(offset);

      const usuariosCancelacionIds = [...new Set(cancelaciones.map((c) => c.usuario_cancelacion_id).filter((id): id is string => id !== null))];

      const usuariosCancelacion =
        usuariosCancelacionIds.length > 0
          ? await tx.select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, rol: usuarios.rol }).from(usuarios).where(inArray(usuarios.id, usuariosCancelacionIds))
          : [];

      const usuariosMap = new Map(usuariosCancelacion.map((u) => [u.id, u]));

      const cancelacionesDetalle: DonacionCanceladaDetalle[] = cancelaciones.map((c) => ({
        ...c,
        user_id: c.user_id ?? '',
        motivo_cancelacion: (c.motivo_cancelacion ?? 'otro') as MotivoCancelacion,
        observaciones_cancelacion: c.observaciones_cancelacion ?? undefined,
        usuario_cancelacion_id: c.usuario_cancelacion_id ?? '',
        fecha_cancelacion: c.fecha_cancelacion?.toISOString() ?? '',
        fecha_disponible: c.fecha_disponible ?? '',
        creado_en: c.creado_en.toISOString(),
        impacto_estimado_personas: c.impacto_estimado_personas ?? undefined,
        codigo_comprobante: c.codigo_comprobante ?? undefined,
        cantidad: Number(c.cantidad),
        usuario_cancelacion_nombre: c.usuario_cancelacion_id ? (usuariosMap.get(c.usuario_cancelacion_id)?.nombre ?? 'Desconocido') : 'Sistema',
        usuario_cancelacion_email: c.usuario_cancelacion_id ? (usuariosMap.get(c.usuario_cancelacion_id)?.email ?? '') : '',
        usuario_cancelacion_rol: c.usuario_cancelacion_id ? (usuariosMap.get(c.usuario_cancelacion_id)?.rol ?? '') : '',
      }));

      let estadisticas: EstadisticasCancelaciones | undefined;

      if (incluirEstadisticas.value) {
        const statsData = await tx
          .select({ motivo_cancelacion: donaciones.motivoCancelacion, cantidad: donaciones.cantidad })
          .from(donaciones)
          .where(and(eq(donaciones.estado, 'Cancelada'), isNotNull(donaciones.motivoCancelacion)));

        const stats: EstadisticasCancelaciones = {
          total: { cancelaciones: statsData.length, cantidad_total: statsData.reduce((sum, item) => sum + Number(item.cantidad || 0), 0) },
          por_motivo: Object.fromEntries(MOTIVOS.map((m) => [m, { cancelaciones: 0, cantidad: 0 }])) as EstadisticasCancelaciones['por_motivo'],
        };

        statsData.forEach((item) => {
          const m = item.motivo_cancelacion as MotivoCancelacion | null;
          if (m && stats.por_motivo[m]) {
            stats.por_motivo[m].cancelaciones++;
            stats.por_motivo[m].cantidad += Number(item.cantidad || 0);
          }
        });

        estadisticas = stats;
      }

      return NextResponse.json({
        success: true,
        data: cancelacionesDetalle,
        pagination: { total: count || 0, offset, limit, has_more: offset + limit < (count || 0) },
        ...(estadisticas && { estadisticas }),
      });
    });
  } catch (error) {
    console.error('Error en GET /api/admin/cancelaciones-donaciones:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
