/**
 * @fileoverview API para generar comprobantes electrónicos desde QR o código legible
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { withRlsContext, type Tx } from '@/db/client';
import { donaciones, solicitudes, unidades, usuarios } from '@/db/schema';
import { decodificarQRPayload, formatearFecha, formatearFechaSolo } from '@/lib/comprobante';
import type { DatosComprobante, QRPayload } from '@/lib/comprobante/types';
import { parsePositiveIntParam, parseUuid, type ApiValidationResult } from '@/lib/api-validation';
import { requireAuth, type ActiveUserProfile } from '@/lib/server-auth';

const DESCRIPCION_PROYECTO = `
El Banco de Alimentos es una organización sin fines de lucro dedicada a combatir el hambre
y reducir el desperdicio alimentario. Nuestra misión es recolectar alimentos excedentes de
donantes y distribuirlos de manera equitativa a personas y familias en situación de
vulnerabilidad alimentaria.
`.trim();

const MAX_CODIGO_LENGTH = 2048;
const QR_TIMESTAMP_MIN = Date.UTC(2000, 0, 1);
const QR_TIMESTAMP_MAX = Date.UTC(2100, 0, 1);

function esCodigoLegible(codigo: string): boolean {
  return /^(SOL|DON)-[A-Z0-9]+-[A-Z0-9]+$/i.test(codigo);
}

function esPayloadCodificadoSeguro(codigo: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(codigo);
}

interface SolicitudComprobanteRow {
  id: string;
  usuario_id: string;
  tipo_alimento: string;
  cantidad: number;
  estado: string;
  created_at: string;
  fecha_respuesta: string | null;
  comentario_admin: string | null;
  codigo_comprobante: string | null;
  unidad_simbolo?: string | null;
  usuario_nombre?: string | null;
  usuario_cedula?: string | null;
  usuario_telefono?: string | null;
  usuario_email?: string | null;
  usuario_direccion?: string | null;
}

interface DonacionComprobanteRow {
  id: number;
  user_id: string | null;
  codigo_comprobante: string | null;
  actualizado_en: string | null;
  creado_en: string;
  nombre_donante: string;
  email: string;
  telefono: string | null;
  direccion_donante_completa: string | null;
  cedula_donante: string | null;
  ruc_donante: string | null;
  tipo_producto: string;
  cantidad: number;
  unidad_simbolo: string | null;
  estado: string;
}

type PayloadQRValidado =
  | { tipo: 'solicitud'; pedidoId: string; codigoComprobante: string; fechaEmision: string }
  | { tipo: 'donacion'; pedidoId: number; codigoComprobante: string; fechaEmision: string };

function puedeVerComprobante(usuario: ActiveUserProfile, tipo: 'solicitud' | 'donacion', registro: { user_id?: string | null; usuario_id?: string | null }): boolean {
  const rol = String(usuario.rol ?? '').toUpperCase();
  if (rol === 'ADMINISTRADOR' || rol === 'OPERADOR') {
    return true;
  }
  if (tipo === 'donacion') {
    return registro.user_id === usuario.id;
  }
  return registro.usuario_id === usuario.id;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  try {
    const { codigo } = await params;

    if (!codigo) {
      return NextResponse.json({ error: 'Código de comprobante no proporcionado' }, { status: 400 });
    }

    if (codigo.length > MAX_CODIGO_LENGTH) {
      return NextResponse.json({ error: 'Código de comprobante demasiado largo' }, { status: 400 });
    }

    const auth = await requireAuth();
    if (auth.response) {
      return auth.response;
    }
    const usuario = auth.profile;

    return withRlsContext(usuario.id, async (tx) => {
      if (esCodigoLegible(codigo)) {
        return buscarPorCodigoLegible(tx, codigo, usuario);
      }

      if (!esPayloadCodificadoSeguro(codigo)) {
        return NextResponse.json({ error: 'Código de comprobante inválido' }, { status: 400 });
      }

      const payload = decodificarQRPayload(codigo);
      if (!payload) {
        return NextResponse.json({ error: 'Código de comprobante inválido' }, { status: 400 });
      }

      const payloadValidado = validarPayloadQR(payload);
      if (!payloadValidado.success) {
        return payloadValidado.response;
      }

      if (payloadValidado.value.tipo === 'solicitud') {
        return obtenerSolicitudPorId(tx, payloadValidado.value.pedidoId, payloadValidado.value.codigoComprobante, payloadValidado.value.fechaEmision, usuario);
      }

      return obtenerDonacionPorId(tx, payloadValidado.value.pedidoId, payloadValidado.value.codigoComprobante, payloadValidado.value.fechaEmision, usuario);
    });
  } catch (error) {
    console.error('Error procesando comprobante:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

function validarPayloadQR(payload: QRPayload): ApiValidationResult<PayloadQRValidado> {
  if (payload.t !== 'S' && payload.t !== 'D') {
    return { success: false, response: NextResponse.json({ error: 'Tipo de comprobante inválido' }, { status: 400 }) };
  }

  if (typeof payload.c !== 'string' || !esCodigoLegible(payload.c)) {
    return { success: false, response: NextResponse.json({ error: 'Código de comprobante inválido' }, { status: 400 }) };
  }

  const usuarioId = parseUuid(payload.u, { name: 'u' });
  if (!usuarioId.success) return usuarioId;

  const fecha = parsePositiveIntParam(payload.f, { name: 'f', min: QR_TIMESTAMP_MIN, max: QR_TIMESTAMP_MAX });
  if (!fecha.success) return fecha;

  const fechaEmision = new Date(fecha.value).toISOString();

  if (payload.t === 'S') {
    const solicitudId = parseUuid(payload.p, { name: 'p' });
    if (!solicitudId.success) return solicitudId;

    return { success: true, value: { tipo: 'solicitud', pedidoId: solicitudId.value, codigoComprobante: payload.c.toUpperCase(), fechaEmision } };
  }

  const donacionId = parsePositiveIntParam(payload.p, { name: 'p', min: 1, max: 2147483647 });
  if (!donacionId.success) return donacionId;

  return { success: true, value: { tipo: 'donacion', pedidoId: donacionId.value, codigoComprobante: payload.c.toUpperCase(), fechaEmision } };
}

async function fetchSolicitudRow(tx: Tx, where: ReturnType<typeof eq>): Promise<SolicitudComprobanteRow | null> {
  const [row] = await tx
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
      unidad_simbolo: unidades.simbolo,
      usuario_nombre: usuarios.nombre,
      usuario_cedula: usuarios.cedula,
      usuario_telefono: usuarios.telefono,
      usuario_email: usuarios.email,
      usuario_direccion: usuarios.direccion,
    })
    .from(solicitudes)
    .leftJoin(unidades, eq(solicitudes.unidadId, unidades.id))
    .leftJoin(usuarios, eq(solicitudes.usuarioId, usuarios.id))
    .where(where)
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    cantidad: Number(row.cantidad),
    created_at: row.created_at.toISOString(),
    fecha_respuesta: row.fecha_respuesta?.toISOString() ?? null,
  };
}

async function buscarPorCodigoLegible(tx: Tx, codigo: string, usuario: ActiveUserProfile) {
  const esSolicitud = codigo.toUpperCase().startsWith('SOL-');

  if (esSolicitud) {
    const solicitud = await fetchSolicitudRow(tx, eq(solicitudes.codigoComprobante, codigo.toUpperCase()));
    if (!solicitud) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }
    if (!puedeVerComprobante(usuario, 'solicitud', solicitud)) {
      return NextResponse.json({ error: 'No tienes permisos para ver este comprobante' }, { status: 403 });
    }
    return generarRespuestaSolicitud(solicitud, codigo);
  }

  const [donacion] = await tx.select().from(donaciones).where(eq(donaciones.codigoComprobante, codigo.toUpperCase())).limit(1);
  if (!donacion) {
    return NextResponse.json({ error: 'Donación no encontrada' }, { status: 404 });
  }
  const mapped = mapDonacionRow(donacion);
  if (!puedeVerComprobante(usuario, 'donacion', mapped)) {
    return NextResponse.json({ error: 'No tienes permisos para ver este comprobante' }, { status: 403 });
  }
  return generarRespuestaDonacion(mapped, codigo);
}

async function obtenerSolicitudPorId(tx: Tx, id: string, codigoComprobante: string, fecha: string, usuario: ActiveUserProfile) {
  const solicitud = await fetchSolicitudRow(tx, eq(solicitudes.id, id));
  if (!solicitud) {
    return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
  }
  if (!puedeVerComprobante(usuario, 'solicitud', solicitud)) {
    return NextResponse.json({ error: 'No tienes permisos para ver este comprobante' }, { status: 403 });
  }
  return generarRespuestaSolicitud(solicitud, codigoComprobante, fecha);
}

async function obtenerDonacionPorId(tx: Tx, id: number, codigoComprobante: string, fecha: string, usuario: ActiveUserProfile) {
  const [donacion] = await tx.select().from(donaciones).where(eq(donaciones.id, id)).limit(1);
  if (!donacion) {
    return NextResponse.json({ error: 'Donación no encontrada' }, { status: 404 });
  }
  const mapped = mapDonacionRow(donacion);
  if (!puedeVerComprobante(usuario, 'donacion', mapped)) {
    return NextResponse.json({ error: 'No tienes permisos para ver este comprobante' }, { status: 403 });
  }
  return generarRespuestaDonacion(mapped, codigoComprobante, fecha);
}

function mapDonacionRow(donacion: typeof donaciones.$inferSelect): DonacionComprobanteRow {
  return {
    id: donacion.id,
    user_id: donacion.userId,
    codigo_comprobante: donacion.codigoComprobante,
    actualizado_en: donacion.actualizadoEn.toISOString(),
    creado_en: donacion.creadoEn.toISOString(),
    nombre_donante: donacion.nombreDonante,
    email: donacion.email,
    telefono: donacion.telefono,
    direccion_donante_completa: donacion.direccionDonanteCompleta,
    cedula_donante: donacion.cedulaDonante,
    ruc_donante: donacion.rucDonante,
    tipo_producto: donacion.tipoProducto,
    cantidad: Number(donacion.cantidad),
    unidad_simbolo: donacion.unidadSimbolo,
    estado: donacion.estado,
  };
}

function generarRespuestaSolicitud(solicitud: SolicitudComprobanteRow, codigoComprobante: string, fecha?: string) {
  const fechaEmision = fecha ?? solicitud.fecha_respuesta ?? solicitud.created_at;

  const comprobante: DatosComprobante = {
    codigoComprobante: solicitud.codigo_comprobante || codigoComprobante,
    fechaEmision,
    fechaVencimiento: new Date(new Date(fechaEmision).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    usuario: {
      id: solicitud.usuario_id,
      nombre: solicitud.usuario_nombre ?? 'N/A',
      email: solicitud.usuario_email ?? 'N/A',
      telefono: solicitud.usuario_telefono ?? undefined,
      direccion: solicitud.usuario_direccion ?? undefined,
      documento: solicitud.usuario_cedula ?? undefined,
    },
    pedido: {
      id: solicitud.id,
      tipo: 'solicitud',
      tipoAlimento: solicitud.tipo_alimento,
      cantidad: solicitud.cantidad,
      unidad: solicitud.unidad_simbolo ?? 'unidades',
      estado: solicitud.estado,
      fechaCreacion: solicitud.created_at,
      fechaAprobacion: solicitud.fecha_respuesta ?? undefined,
      comentarioAdmin: solicitud.comentario_admin ?? undefined,
    },
    descripcionProyecto: DESCRIPCION_PROYECTO,
    instrucciones: [
      'Verifique los datos del beneficiario con su documento de identidad.',
      'Confirme la cantidad y tipo de alimento a entregar.',
      'Solicite la firma del beneficiario en el campo correspondiente.',
      'Firme como operador que realiza la entrega.',
      'Entregue una copia del comprobante al beneficiario.',
    ],
  };

  return NextResponse.json({
    success: true,
    tipo: 'solicitud',
    comprobante,
    formatoFechas: {
      fechaEmision: formatearFecha(comprobante.fechaEmision),
      fechaVencimiento: formatearFechaSolo(comprobante.fechaVencimiento),
      fechaCreacion: formatearFecha(comprobante.pedido.fechaCreacion),
    },
  });
}

function generarRespuestaDonacion(donacion: DonacionComprobanteRow, codigoComprobante: string, fecha?: string) {
  const fechaEmision = fecha ?? donacion.actualizado_en ?? donacion.creado_en;

  const comprobante: DatosComprobante = {
    codigoComprobante: donacion.codigo_comprobante || codigoComprobante,
    fechaEmision,
    fechaVencimiento: new Date(new Date(fechaEmision).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    usuario: {
      id: donacion.user_id ?? '',
      nombre: donacion.nombre_donante,
      email: donacion.email,
      telefono: donacion.telefono ?? undefined,
      direccion: donacion.direccion_donante_completa ?? undefined,
      documento: donacion.cedula_donante ?? donacion.ruc_donante ?? undefined,
    },
    pedido: {
      id: String(donacion.id),
      tipo: 'donacion',
      tipoAlimento: donacion.tipo_producto,
      cantidad: donacion.cantidad,
      unidad: donacion.unidad_simbolo ?? 'unidades',
      estado: donacion.estado,
      fechaCreacion: donacion.creado_en,
      fechaAprobacion: donacion.actualizado_en ?? undefined,
    },
    descripcionProyecto: DESCRIPCION_PROYECTO,
    instrucciones: [
      'Verifique los datos del donante con su documento de identidad.',
      'Inspeccione los alimentos antes de recibirlos.',
      'Confirme la cantidad y tipo de alimento donado.',
      'Solicite la firma del donante en el campo correspondiente.',
      'Firme como operador que recibe la donación.',
      'Entregue una copia del comprobante al donante.',
    ],
  };

  return NextResponse.json({
    success: true,
    tipo: 'donacion',
    comprobante,
    formatoFechas: {
      fechaEmision: formatearFecha(comprobante.fechaEmision),
      fechaVencimiento: formatearFechaSolo(comprobante.fechaVencimiento),
      fechaCreacion: formatearFecha(comprobante.pedido.fechaCreacion),
    },
  });
}
