/**
 * @fileoverview API para generar comprobantes electrónicos desde QR o código legible
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { decodificarQRPayload, formatearFecha, formatearFechaSolo } from '@/lib/comprobante';
import type { DatosComprobante, QRPayload } from '@/lib/comprobante/types';
import { parsePositiveIntParam, parseUuid, type ApiValidationResult } from '@/lib/api-validation';
import { requireActiveUserRole } from '@/lib/server-auth';

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

const DESCRIPCION_PROYECTO = `
El Banco de Alimentos es una organización sin fines de lucro dedicada a combatir el hambre 
y reducir el desperdicio alimentario. Nuestra misión es recolectar alimentos excedentes de 
donantes y distribuirlos de manera equitativa a personas y familias en situación de 
vulnerabilidad alimentaria.
`.trim();

const MAX_CODIGO_LENGTH = 2048;
const QR_TIMESTAMP_MIN = Date.UTC(2000, 0, 1);
const QR_TIMESTAMP_MAX = Date.UTC(2100, 0, 1);

/**
 * Verifica si el código es un código legible (SOL-xxx o DON-xxx)
 */
function esCodigoLegible(codigo: string): boolean {
  return /^(SOL|DON)-[A-Z0-9]+-[A-Z0-9]+$/i.test(codigo);
}

function esPayloadCodificadoSeguro(codigo: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(codigo);
}

type AccesoUsuario = {
  id: string;
  rol: string | null;
};

type SolicitudComprobanteRow = {
  id: string;
  usuario_id: string;
  tipo_alimento: string;
  cantidad: number;
  estado: string;
  created_at: string;
  fecha_respuesta: string | null;
  comentario_admin: string | null;
  codigo_comprobante: string | null;
  unidades?: {
    id?: number | null;
    nombre?: string | null;
    simbolo?: string | null;
  } | null;
  usuarios?: {
    nombre?: string | null;
    cedula?: string | null;
    telefono?: string | null;
    email?: string | null;
    direccion?: string | null;
  } | null;
};

type DonacionComprobanteRow = {
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
};

type PayloadQRValidado =
  | {
      tipo: 'solicitud';
      pedidoId: string;
      codigoComprobante: string;
      fechaEmision: string;
    }
  | {
      tipo: 'donacion';
      pedidoId: number;
      codigoComprobante: string;
      fechaEmision: string;
    };

async function obtenerAccesoUsuario(supabase: ServerSupabaseClient): Promise<{
  usuario: AccesoUsuario | null;
  errorResponse?: NextResponse;
}> {
  const authResult = await requireActiveUserRole(supabase, [
    'ADMINISTRADOR',
    'OPERADOR',
    'DONANTE',
    'SOLICITANTE',
  ]);

  if (authResult.response) {
    return {
      usuario: null,
      errorResponse: authResult.response,
    };
  }

  return {
    usuario: {
      id: authResult.user.id,
      rol: authResult.profile.rol
    }
  };
}

function puedeVerComprobante(usuario: AccesoUsuario, tipo: 'solicitud' | 'donacion', registro: { user_id?: string | null; usuario_id?: string | null }): boolean {
  const rol = String(usuario.rol ?? '').toUpperCase();

  if (rol === 'ADMINISTRADOR' || rol === 'OPERADOR') {
    return true;
  }

  if (tipo === 'donacion') {
    return registro.user_id === usuario.id;
  }

  return registro.usuario_id === usuario.id;
}

export async function GET({ params }: { params: Promise<{ codigo: string }> }) {
  try {
    const { codigo } = await params;

    if (!codigo) {
      return NextResponse.json(
        { error: 'Código de comprobante no proporcionado' },
        { status: 400 }
      );
    }

    if (codigo.length > MAX_CODIGO_LENGTH) {
      return NextResponse.json(
        { error: 'Código de comprobante demasiado largo' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const acceso = await obtenerAccesoUsuario(supabase);

    if (acceso.errorResponse) {
      return acceso.errorResponse;
    }

    const usuario = acceso.usuario;
    if (!usuario) {
      return NextResponse.json(
        { error: 'Necesitas iniciar sesión para ver este comprobante' },
        { status: 401 }
      );
    }

    // Verificar si es un código legible (SOL-xxx o DON-xxx)
    if (esCodigoLegible(codigo)) {
      return await buscarPorCodigoLegible(supabase, codigo, usuario);
    }

    if (!esPayloadCodificadoSeguro(codigo)) {
      return NextResponse.json(
        { error: 'Código de comprobante inválido' },
        { status: 400 }
      );
    }

    // Si no es código legible, intentar decodificar como payload QR
    const payload = decodificarQRPayload(codigo);
    if (!payload) {
      return NextResponse.json(
        { error: 'Código de comprobante inválido' },
        { status: 400 }
      );
    }

    const payloadValidado = validarPayloadQR(payload);
    if (!payloadValidado.success) {
      return payloadValidado.response;
    }

    if (payloadValidado.value.tipo === 'solicitud') {
      return await obtenerSolicitudPorId(
        supabase,
        payloadValidado.value.pedidoId,
        payloadValidado.value.codigoComprobante,
        payloadValidado.value.fechaEmision,
        usuario
      );
    }

    return await obtenerDonacionPorId(
      supabase,
      payloadValidado.value.pedidoId,
      payloadValidado.value.codigoComprobante,
      payloadValidado.value.fechaEmision,
      usuario
    );
  } catch (error) {
    console.error('Error procesando comprobante:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

function validarPayloadQR(payload: QRPayload): ApiValidationResult<PayloadQRValidado> {
  if (payload.t !== 'S' && payload.t !== 'D') {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Tipo de comprobante inválido' },
        { status: 400 }
      ),
    };
  }

  if (typeof payload.c !== 'string' || !esCodigoLegible(payload.c)) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Código de comprobante inválido' },
        { status: 400 }
      ),
    };
  }

  const usuarioId = parseUuid(payload.u, { name: 'u' });
  if (!usuarioId.success) return usuarioId;

  const fecha = parsePositiveIntParam(payload.f, {
    name: 'f',
    min: QR_TIMESTAMP_MIN,
    max: QR_TIMESTAMP_MAX,
  });
  if (!fecha.success) return fecha;

  const fechaEmision = new Date(fecha.value).toISOString();

  if (payload.t === 'S') {
    const solicitudId = parseUuid(payload.p, { name: 'p' });
    if (!solicitudId.success) return solicitudId;

    return {
      success: true,
      value: {
        tipo: 'solicitud',
        pedidoId: solicitudId.value,
        codigoComprobante: payload.c.toUpperCase(),
        fechaEmision,
      },
    };
  }

  const donacionId = parsePositiveIntParam(payload.p, {
    name: 'p',
    min: 1,
    max: 2147483647,
  });
  if (!donacionId.success) return donacionId;

  return {
    success: true,
    value: {
      tipo: 'donacion',
      pedidoId: donacionId.value,
      codigoComprobante: payload.c.toUpperCase(),
      fechaEmision,
    },
  };
}

/**
 * Busca un comprobante por código legible (SOL-xxx o DON-xxx)
 */
async function buscarPorCodigoLegible(supabase: ServerSupabaseClient, codigo: string, usuario: AccesoUsuario) {
  const esSolicitud = codigo.toUpperCase().startsWith('SOL-');

  if (esSolicitud) {
    // Buscar en solicitudes
    const { data: solicitud, error } = await supabase
      .from('solicitudes')
      .select(`
        id,
        usuario_id,
        tipo_alimento,
        cantidad,
        estado,
        created_at,
        fecha_respuesta,
        comentario_admin,
        codigo_comprobante,
        unidades (id, nombre, simbolo),
        usuarios (nombre, cedula, telefono, email, direccion)
      `)
      .eq('codigo_comprobante', codigo.toUpperCase())
      .single();

    if (error || !solicitud) {
      return NextResponse.json(
        { error: 'Solicitud no encontrada' },
        { status: 404 }
      );
    }

    if (!puedeVerComprobante(usuario, 'solicitud', solicitud)) {
      return NextResponse.json(
        { error: 'No tienes permisos para ver este comprobante' },
        { status: 403 }
      );
    }

    return generarRespuestaSolicitud(solicitud as SolicitudComprobanteRow, codigo);
  } else {
    // Buscar en donaciones
    const { data: donacion, error } = await supabase
      .from('donaciones')
      .select('*')
      .eq('codigo_comprobante', codigo.toUpperCase())
      .single();

    if (error || !donacion) {
      return NextResponse.json(
        { error: 'Donación no encontrada' },
        { status: 404 }
      );
    }

    if (!puedeVerComprobante(usuario, 'donacion', donacion)) {
      return NextResponse.json(
        { error: 'No tienes permisos para ver este comprobante' },
        { status: 403 }
      );
    }

    return generarRespuestaDonacion(donacion as DonacionComprobanteRow, codigo);
  }
}

/**
 * Obtiene solicitud por ID (usado para payload QR)
 */
async function obtenerSolicitudPorId(supabase: ServerSupabaseClient, id: string, codigoComprobante: string, fecha: string, usuario: AccesoUsuario) {
  const { data: solicitud, error } = await supabase
    .from('solicitudes')
    .select(`
      id,
      usuario_id,
      tipo_alimento,
      cantidad,
      estado,
      created_at,
      fecha_respuesta,
      comentario_admin,
      codigo_comprobante,
      unidades (id, nombre, simbolo),
      usuarios (nombre, cedula, telefono, email, direccion)
    `)
    .eq('id', id)
    .single();

  if (error || !solicitud) {
    return NextResponse.json(
      { error: 'Solicitud no encontrada' },
      { status: 404 }
    );
  }

  if (!puedeVerComprobante(usuario, 'solicitud', solicitud)) {
    return NextResponse.json(
      { error: 'No tienes permisos para ver este comprobante' },
      { status: 403 }
    );
  }

  return generarRespuestaSolicitud(solicitud as SolicitudComprobanteRow, codigoComprobante, fecha);
}

/**
 * Obtiene donación por ID (usado para payload QR)
 */
async function obtenerDonacionPorId(supabase: ServerSupabaseClient, id: number, codigoComprobante: string, fecha: string, usuario: AccesoUsuario) {
  const { data: donacion, error } = await supabase
    .from('donaciones')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !donacion) {
    return NextResponse.json(
      { error: 'Donación no encontrada' },
      { status: 404 }
    );
  }

  if (!puedeVerComprobante(usuario, 'donacion', donacion)) {
    return NextResponse.json(
      { error: 'No tienes permisos para ver este comprobante' },
      { status: 403 }
    );
  }

  return generarRespuestaDonacion(donacion as DonacionComprobanteRow, codigoComprobante, fecha);
}

/**
 * Genera la respuesta JSON para una solicitud
 */
function generarRespuestaSolicitud(solicitud: SolicitudComprobanteRow, codigoComprobante: string, fecha?: string) {
  const fechaEmision = fecha ?? solicitud.fecha_respuesta ?? solicitud.created_at;
  
  const comprobante: DatosComprobante = {
    codigoComprobante: solicitud.codigo_comprobante || codigoComprobante,
    fechaEmision,
    fechaVencimiento: new Date(new Date(fechaEmision).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    usuario: {
      id: solicitud.usuario_id,
      nombre: solicitud.usuarios?.nombre ?? 'N/A',
      email: solicitud.usuarios?.email ?? 'N/A',
      telefono: solicitud.usuarios?.telefono ?? undefined,
      direccion: solicitud.usuarios?.direccion ?? undefined,
      documento: solicitud.usuarios?.cedula ?? undefined,
    },
    pedido: {
      id: solicitud.id,
      tipo: 'solicitud',
      tipoAlimento: solicitud.tipo_alimento,
      cantidad: solicitud.cantidad,
      unidad: solicitud.unidades?.simbolo ?? 'unidades',
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

/**
 * Genera la respuesta JSON para una donación
 */
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
