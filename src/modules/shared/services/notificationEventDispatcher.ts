import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generarCodigoComprobante,
  generarDatosComprobante,
  generarQRBase64,
  generarURLComprobante,
} from '@/lib/comprobante';
import {
  buildDonacionAprobadaEmailTemplate,
  buildDonacionCanceladaEmailTemplate,
} from '@/lib/email/templates/donacionEmail';
import {
  buildSolicitudAprobadaEmailTemplate,
  buildSolicitudEntregadaEmailTemplate,
  buildSolicitudRechazadaEmailTemplate,
} from '@/lib/email/templates/solicitudEmail';
import { getBaseUrl } from '@/lib/getBaseUrl';
import {
  isPlainObject,
  type ActiveUserProfile,
  type AppUserRole,
} from '@/lib/server-auth';
import type { CreateNotificationInput } from './notificationService';
import {
  isNotificationEventType,
  SENSITIVE_NOTIFICATION_PAYLOAD_FIELDS,
  type NotificationEventPayload,
  type NotificationEventType,
} from './notificationEvents';
import {
  parsePositiveIntegerValue,
  parseUuidValue,
} from '@/lib/validation-core';

type DispatchStatus = 400 | 403 | 404 | 422 | 500;

type ParseNotificationEventPayloadResult =
  | { success: true; payload: NotificationEventPayload }
  | { success: false; error: string };

type EntityIdValidationResult =
  | { success: true; value: string }
  | { success: false; error: string };

type RelatedOne<T> = T | T[] | null | undefined;

interface CatalogFoodRequestRow {
  id: string;
  solicitante_id: string;
  nombre: string;
  categoria: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  comentario_admin: string | null;
}

interface SolicitudUsuarioRow {
  nombre?: string | null;
  cedula?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  tipo_persona?: string | null;
}

interface SolicitudUnidadRow {
  id?: number | null;
  nombre?: string | null;
  simbolo?: string | null;
  tipo_magnitud_id?: number | null;
  es_base?: boolean | null;
}

interface FoodRequestRow {
  id: string;
  usuario_id: string;
  tipo_alimento: string;
  cantidad: number | string;
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'entregada';
  created_at: string;
  comentario_admin: string | null;
  motivo_rechazo: string | null;
  codigo_comprobante: string | null;
  cantidad_entregada: number | string | null;
  tiene_entregas_parciales: boolean | null;
  usuarios?: RelatedOne<SolicitudUsuarioRow>;
  unidades?: RelatedOne<SolicitudUnidadRow>;
}

interface DonationRow {
  id: number;
  user_id: string | null;
  nombre_donante: string;
  ruc_donante: string | null;
  cedula_donante: string | null;
  direccion_donante_completa: string | null;
  telefono: string | null;
  email: string;
  tipo_producto: string;
  cantidad: number | string;
  unidad_simbolo: string | null;
  estado: 'Pendiente' | 'Aprobada' | 'Cancelada';
  creado_en: string;
  codigo_comprobante: string | null;
  motivo_cancelacion: string | null;
  observaciones_cancelacion: string | null;
}

interface PartialDeliveryRow {
  cantidad_entregada: number | string | null;
  cantidad_solicitada: number | string | null;
  porcentaje_entregado: number | null;
  comentario: string | null;
}

const EVENT_ALLOWED_ROLES = {
  catalog_food_request_created: ['DONANTE'],
  catalog_food_request_reviewed: ['ADMINISTRADOR'],
  food_request_status_changed: ['ADMINISTRADOR', 'OPERADOR'],
  donation_status_changed: ['ADMINISTRADOR', 'OPERADOR'],
} as const satisfies Record<NotificationEventPayload['event'], readonly AppUserRole[]>;

export class NotificationDispatchError extends Error {
  constructor(
    readonly status: DispatchStatus,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'NotificationDispatchError';
  }
}

export const parseNotificationEventPayload = (body: unknown): ParseNotificationEventPayloadResult => {
  if (!isPlainObject(body)) {
    return { success: false, error: 'El payload debe ser un objeto.' };
  }

  const sensitiveFields = Object.keys(body).filter(field =>
    SENSITIVE_NOTIFICATION_PAYLOAD_FIELDS.includes(
      field as (typeof SENSITIVE_NOTIFICATION_PAYLOAD_FIELDS)[number]
    )
  );

  if (sensitiveFields.length > 0) {
    return {
      success: false,
      error: `Campos no permitidos: ${sensitiveFields.join(', ')}.`,
    };
  }

  if (!isNotificationEventType(body.event)) {
    return { success: false, error: 'event no es un evento de notificacion permitido.' };
  }

  if (typeof body.entityId !== 'string' || !body.entityId.trim()) {
    return { success: false, error: 'entityId es obligatorio.' };
  }

  const entityId = validateEntityIdForEvent(body.event, body.entityId.trim());
  if (!entityId.success) {
    return { success: false, error: entityId.error };
  }

  return {
    success: true,
    payload: {
      event: body.event,
      entityId: entityId.value,
    },
  };
};

function validateEntityIdForEvent(
  event: NotificationEventType,
  entityId: string
): EntityIdValidationResult {
  if (event === 'donation_status_changed') {
    const donationId = parsePositiveIntegerValue(entityId, {
      name: 'entityId',
      min: 1,
      max: 2147483647,
    });

    return donationId.success
      ? { success: true, value: String(donationId.value) }
      : { success: false, error: 'entityId de donacion invalido.' };
  }

  const uuid = parseUuidValue(entityId, { name: 'entityId' });

  return uuid.success
    ? { success: true, value: uuid.value }
    : { success: false, error: 'entityId debe ser un UUID valido para este evento.' };
}

export async function buildNotificationForEvent(
  supabase: SupabaseClient,
  profile: ActiveUserProfile,
  payload: NotificationEventPayload
): Promise<CreateNotificationInput> {
  assertRoleAllowed(profile, EVENT_ALLOWED_ROLES[payload.event]);

  switch (payload.event) {
    case 'catalog_food_request_created':
      return buildCatalogFoodRequestCreatedNotification(supabase, profile, payload.entityId);
    case 'catalog_food_request_reviewed':
      return buildCatalogFoodRequestReviewedNotification(supabase, payload.entityId);
    case 'food_request_status_changed':
      return buildFoodRequestStatusChangedNotification(supabase, payload.entityId);
    case 'donation_status_changed':
      return buildDonationStatusChangedNotification(supabase, payload.entityId);
  }
}

function assertRoleAllowed(
  profile: ActiveUserProfile,
  allowedRoles: readonly AppUserRole[]
) {
  if (!allowedRoles.includes(profile.rol)) {
    throw new NotificationDispatchError(403, 'Rol no permitido para este evento.');
  }
}

async function buildCatalogFoodRequestCreatedNotification(
  supabase: SupabaseClient,
  profile: ActiveUserProfile,
  entityId: string
): Promise<CreateNotificationInput> {
  const solicitud = await getCatalogFoodRequest(supabase, entityId);

  if (solicitud.solicitante_id !== profile.id) {
    throw new NotificationDispatchError(403, 'No puedes notificar una solicitud ajena.');
  }

  const nombre = solicitud.nombre.trim();
  const categoria = solicitud.categoria.trim();
  const solicitante = profile.nombre ?? profile.email ?? 'Un donante';

  return {
    titulo: `Nueva solicitud de alta: ${nombre}`,
    mensaje: `${solicitante} solicito registrar "${nombre}" en la categoria "${categoria}".`,
    tipo: 'info',
    categoria: 'catalogo',
    rolDestinatario: 'ADMINISTRADOR',
    urlAccion: '/admin/catalogo',
    metadatos: {
      event: 'catalog_food_request_created',
      solicitudId: solicitud.id,
      nombre,
      categoria,
      solicitanteId: solicitud.solicitante_id,
    },
  };
}

async function buildCatalogFoodRequestReviewedNotification(
  supabase: SupabaseClient,
  entityId: string
): Promise<CreateNotificationInput> {
  const solicitud = await getCatalogFoodRequest(supabase, entityId);

  if (solicitud.estado === 'pendiente') {
    throw new NotificationDispatchError(422, 'La solicitud de alta aun no fue revisada.');
  }

  const nombre = solicitud.nombre.trim();
  const categoria = solicitud.categoria.trim();
  const aprobada = solicitud.estado === 'aprobada';
  const comentario = solicitud.comentario_admin?.trim();

  return {
    titulo: aprobada ? `Solicitud aprobada: ${nombre}` : `Solicitud rechazada: ${nombre}`,
    mensaje: aprobada
      ? `Tu solicitud para registrar "${nombre}" en la categoria "${categoria}" fue aprobada y ya esta disponible en el catalogo.`
      : `Tu solicitud para registrar "${nombre}" en la categoria "${categoria}" fue rechazada.${comentario ? ` Motivo: ${comentario}` : ''}`,
    tipo: aprobada ? 'success' : 'error',
    categoria: 'catalogo',
    destinatarioId: solicitud.solicitante_id,
    urlAccion: '/donante/solicitar-alimento',
    metadatos: {
      event: 'catalog_food_request_reviewed',
      solicitudId: solicitud.id,
      estado: solicitud.estado,
      tipo: 'solicitud_alta_alimento',
    },
  };
}

async function buildFoodRequestStatusChangedNotification(
  supabase: SupabaseClient,
  entityId: string
): Promise<CreateNotificationInput> {
  const solicitud = await getFoodRequest(supabase, entityId);

  if (solicitud.estado === 'pendiente') {
    throw new NotificationDispatchError(422, 'La solicitud aun esta pendiente.');
  }

  const usuario = unwrapRelatedOne(solicitud.usuarios);
  const unidad = unwrapRelatedOne(solicitud.unidades);
  const unidadSimbolo = unidad?.simbolo ?? 'unidades';
  const cantidad = toNumber(solicitud.cantidad);
  const cantidadEntregada = toNumber(solicitud.cantidad_entregada);
  const codigoComprobante =
    solicitud.codigo_comprobante ?? generarCodigoComprobante('solicitud', solicitud.id);
  const datosUsuario = {
    id: solicitud.usuario_id,
    nombre: usuario?.nombre ?? 'Usuario',
    email: usuario?.email ?? '',
    telefono: usuario?.telefono ?? undefined,
    direccion: usuario?.direccion ?? undefined,
    documento: usuario?.cedula ?? undefined,
  };
  const datosPedido = {
    id: solicitud.id,
    tipo: 'solicitud' as const,
    tipoAlimento: solicitud.tipo_alimento,
    cantidad,
    unidad: unidadSimbolo,
    estado: solicitud.estado,
    fechaCreacion: solicitud.created_at,
    fechaAprobacion: new Date().toISOString(),
    comentarioAdmin: solicitud.comentario_admin ?? undefined,
  };
  const comprobante = {
    ...generarDatosComprobante('solicitud', datosUsuario, datosPedido, solicitud.comentario_admin ?? undefined),
    codigoComprobante,
  };
  const baseUrl = getBaseUrl();

  if (solicitud.estado === 'aprobada') {
    const partialDelivery = await getLatestPartialDelivery(supabase, solicitud.id);
    const esParcial = Boolean(solicitud.tiene_entregas_parciales) && cantidadEntregada > 0 && cantidadEntregada < cantidad;
    const cantidadParcial = toNumber(partialDelivery?.cantidad_entregada) || cantidadEntregada;
    const porcentajeEntregado = cantidad > 0
      ? Math.round((cantidadParcial / cantidad) * 100)
      : partialDelivery?.porcentaje_entregado ?? 0;
    const urlComprobante = generarURLComprobante(
      baseUrl,
      comprobante.codigoComprobante,
      'solicitud',
      solicitud.usuario_id,
      solicitud.id
    );
    const qrImageBase64 = await generarQRBase64(urlComprobante);
    const emailTemplate = buildSolicitudAprobadaEmailTemplate({
      comprobante,
      qrImageBase64,
      baseUrl,
    });

    return {
      titulo: esParcial
        ? `Solicitud aprobada parcialmente - Codigo: ${comprobante.codigoComprobante}`
        : `Solicitud aprobada - Codigo: ${comprobante.codigoComprobante}`,
      mensaje: esParcial
        ? `Estimado/a ${datosUsuario.nombre}, su solicitud fue aprobada parcialmente. Se le entregara ${cantidadParcial} ${unidadSimbolo} de los ${cantidad} ${unidadSimbolo} solicitados de ${solicitud.tipo_alimento} (${porcentajeEntregado}% del total).${solicitud.comentario_admin ? ` Comentario del operador: ${solicitud.comentario_admin}.` : ''} Presente el codigo QR adjunto al momento de retirar los alimentos. Valido hasta: ${new Date(comprobante.fechaVencimiento).toLocaleDateString('es-ES')}.`
        : `Estimado/a ${datosUsuario.nombre}, su solicitud de ${cantidad} ${unidadSimbolo} de ${solicitud.tipo_alimento} ha sido aprobada. Presente el codigo QR adjunto al momento de retirar los alimentos. Valido hasta: ${new Date(comprobante.fechaVencimiento).toLocaleDateString('es-ES')}.`,
      categoria: 'solicitud',
      tipo: esParcial ? 'warning' : 'success',
      destinatarioId: solicitud.usuario_id,
      urlAccion: '/user/solicitudes',
      metadatos: {
        event: 'food_request_status_changed',
        solicitudId: solicitud.id,
        nuevoEstado: solicitud.estado,
        codigoComprobante: comprobante.codigoComprobante,
        fechaVencimiento: comprobante.fechaVencimiento,
        esParcial,
        cantidadEntregada: cantidadParcial || undefined,
        cantidadSolicitada: cantidad,
      },
      email: emailTemplate,
    };
  }

  if (solicitud.estado === 'rechazada') {
    const emailTemplate = buildSolicitudRechazadaEmailTemplate({
      comprobante,
      baseUrl,
    });

    return {
      titulo: 'Solicitud no aprobada',
      mensaje: solicitud.comentario_admin
        ? `Estimado/a ${datosUsuario.nombre}, lamentamos informarle que su solicitud de ${solicitud.tipo_alimento} no ha sido aprobada. Motivo: ${solicitud.comentario_admin}. Puede realizar una nueva solicitud en cualquier momento.`
        : `Estimado/a ${datosUsuario.nombre}, lamentamos informarle que su solicitud de ${solicitud.tipo_alimento} no ha sido aprobada en esta ocasion. Puede realizar una nueva solicitud en cualquier momento.`,
      categoria: 'solicitud',
      tipo: 'warning',
      destinatarioId: solicitud.usuario_id,
      urlAccion: '/user/formulario',
      metadatos: {
        event: 'food_request_status_changed',
        solicitudId: solicitud.id,
        nuevoEstado: solicitud.estado,
        motivoRechazo: solicitud.motivo_rechazo ?? undefined,
      },
      email: emailTemplate,
    };
  }

  const urlComprobante = generarURLComprobante(
    baseUrl,
    comprobante.codigoComprobante,
    'solicitud',
    solicitud.usuario_id,
    solicitud.id
  );
  const qrImageBase64 = await generarQRBase64(urlComprobante);
  const emailTemplate = buildSolicitudEntregadaEmailTemplate({
    comprobante,
    qrImageBase64,
    baseUrl,
  });

  return {
    titulo: 'Solicitud procesada y entregada',
    mensaje:
      `Estimado/a ${datosUsuario.nombre}, su solicitud de ${cantidad} ${unidadSimbolo} de ${solicitud.tipo_alimento} ha sido entregada exitosamente y procesada por nuestro equipo.\n\n` +
      'Gracias por confiar en el Banco de Alimentos. Si tiene dudas o necesita realizar una nueva solicitud, puede hacerlo desde la seccion de solicitudes.',
    categoria: 'solicitud',
    tipo: 'success',
    destinatarioId: solicitud.usuario_id,
    urlAccion: '/user/solicitudes',
    metadatos: {
      event: 'food_request_status_changed',
      solicitudId: solicitud.id,
      nuevoEstado: solicitud.estado,
    },
    email: emailTemplate,
  };
}

async function buildDonationStatusChangedNotification(
  supabase: SupabaseClient,
  entityId: string
): Promise<CreateNotificationInput> {
  const donationId = parsePositiveIntegerValue(entityId, {
    name: 'entityId',
    min: 1,
    max: 2147483647,
  });

  if (!donationId.success) {
    throw new NotificationDispatchError(400, 'entityId de donacion invalido.');
  }

  const donation = await getDonation(supabase, donationId.value);

  if (!donation.user_id) {
    throw new NotificationDispatchError(422, 'La donacion no tiene donante asociado.');
  }

  const donorId = parseUuidValue(donation.user_id, { name: 'user_id' });
  if (!donorId.success) {
    throw new NotificationDispatchError(422, 'La donacion tiene un donante invalido.');
  }

  const baseUrl = getBaseUrl();
  const cantidad = toNumber(donation.cantidad);
  const codigoComprobante =
    donation.codigo_comprobante ?? generarCodigoComprobante('donacion', String(donation.id));
  const datosUsuario = {
    id: donorId.value,
    nombre: donation.nombre_donante,
    email: donation.email,
    telefono: donation.telefono ?? undefined,
    direccion: donation.direccion_donante_completa ?? undefined,
    documento: donation.cedula_donante ?? donation.ruc_donante ?? undefined,
  };
  const datosPedido = {
    id: String(donation.id),
    tipo: 'donacion' as const,
    tipoAlimento: donation.tipo_producto,
    cantidad,
    unidad: donation.unidad_simbolo ?? 'unidades',
    estado: donation.estado,
    fechaCreacion: donation.creado_en,
    fechaAprobacion: new Date().toISOString(),
  };
  const comprobante = {
    ...generarDatosComprobante('donacion', datosUsuario, datosPedido),
    codigoComprobante,
  };

  if (donation.estado === 'Cancelada') {
    const motivoTexto = donation.motivo_cancelacion
      ? ` Motivo: ${donation.motivo_cancelacion.replace(/_/g, ' ')}`
      : '';
    const observacionesTexto = donation.observaciones_cancelacion
      ? ` Detalles: ${donation.observaciones_cancelacion}`
      : '';
    const emailTemplate = buildDonacionCanceladaEmailTemplate({
      comprobante: {
        ...comprobante,
        pedido: {
          ...comprobante.pedido,
          comentarioAdmin: donation.observaciones_cancelacion ?? undefined,
        },
      },
      baseUrl,
    });

    return {
      titulo: 'Donacion cancelada',
      mensaje: `Estimado/a ${datosUsuario.nombre}, le informamos que su donacion de ${donation.tipo_producto} ha sido cancelada.${motivoTexto}${observacionesTexto} Si tiene alguna duda, no dude en contactarnos.`,
      categoria: 'donacion',
      tipo: 'warning',
      destinatarioId: donorId.value,
      urlAccion: '/donante/nueva-donacion',
      metadatos: {
        event: 'donation_status_changed',
        donacionId: donation.id,
        nuevoEstado: donation.estado,
        motivoCancelacion: donation.motivo_cancelacion ?? undefined,
        observacionesCancelacion: donation.observaciones_cancelacion ?? undefined,
      },
      email: emailTemplate,
    };
  }

  const urlComprobante = generarURLComprobante(
    baseUrl,
    comprobante.codigoComprobante,
    'donacion',
    donorId.value,
    String(donation.id)
  );
  const qrImageBase64 = await generarQRBase64(urlComprobante);
  const emailTemplate = buildDonacionAprobadaEmailTemplate({
    comprobante,
    qrImageBase64,
    baseUrl,
  });

  if (donation.estado === 'Aprobada') {
    return {
      titulo: `Donacion aprobada - Codigo: ${comprobante.codigoComprobante}`,
      mensaje: `Estimado/a ${datosUsuario.nombre}, su donacion de ${cantidad} ${datosPedido.unidad} de ${donation.tipo_producto} ha sido aprobada e incorporada a nuestro inventario. Gracias por su generosidad. Su aporte ayudara a familias que lo necesitan.`,
      categoria: 'donacion',
      tipo: 'success',
      destinatarioId: donorId.value,
      urlAccion: '/donante/donaciones',
      metadatos: {
        event: 'donation_status_changed',
        donacionId: donation.id,
        nuevoEstado: donation.estado,
        codigoComprobante: comprobante.codigoComprobante,
      },
      email: emailTemplate,
    };
  }

  return {
    titulo: `Donacion registrada - Codigo: ${comprobante.codigoComprobante}`,
    mensaje: `Estimado/a ${datosUsuario.nombre}, su donacion de ${cantidad} ${datosPedido.unidad} de ${donation.tipo_producto} ha sido registrada. Nuestro equipo la procesara pronto.`,
    categoria: 'donacion',
    tipo: 'info',
    destinatarioId: donorId.value,
    urlAccion: '/donante/donaciones',
    metadatos: {
      event: 'donation_status_changed',
      donacionId: donation.id,
      nuevoEstado: donation.estado,
      codigoComprobante: comprobante.codigoComprobante,
    },
    email: emailTemplate,
  };
}

async function getCatalogFoodRequest(
  supabase: SupabaseClient,
  entityId: string
): Promise<CatalogFoodRequestRow> {
  const solicitudId = parseUuidValue(entityId, { name: 'entityId' });
  if (!solicitudId.success) {
    throw new NotificationDispatchError(400, 'entityId debe ser un UUID valido para este evento.');
  }

  const { data, error } = await supabase
    .from('solicitudes_alta_alimentos')
    .select('id, solicitante_id, nombre, categoria, estado, comentario_admin')
    .eq('id', solicitudId.value)
    .maybeSingle();

  if (error) {
    throw new NotificationDispatchError(
      500,
      'No fue posible consultar la solicitud de alta.',
      error
    );
  }

  if (!data) {
    throw new NotificationDispatchError(404, 'Solicitud de alta no encontrada.');
  }

  return data as CatalogFoodRequestRow;
}

async function getFoodRequest(
  supabase: SupabaseClient,
  entityId: string
): Promise<FoodRequestRow> {
  const solicitudId = parseUuidValue(entityId, { name: 'entityId' });
  if (!solicitudId.success) {
    throw new NotificationDispatchError(400, 'entityId debe ser un UUID valido para este evento.');
  }

  const { data, error } = await supabase
    .from('solicitudes')
    .select(`
      id,
      usuario_id,
      tipo_alimento,
      cantidad,
      estado,
      created_at,
      comentario_admin,
      motivo_rechazo,
      codigo_comprobante,
      cantidad_entregada,
      tiene_entregas_parciales,
      unidades:unidad_id (
        id,
        nombre,
        simbolo,
        tipo_magnitud_id,
        es_base
      ),
      usuarios:usuario_id (
        nombre,
        cedula,
        telefono,
        email,
        direccion,
        tipo_persona
      )
    `)
    .eq('id', solicitudId.value)
    .maybeSingle();

  if (error) {
    throw new NotificationDispatchError(500, 'No fue posible consultar la solicitud.', error);
  }

  if (!data) {
    throw new NotificationDispatchError(404, 'Solicitud no encontrada.');
  }

  return data as FoodRequestRow;
}

async function getLatestPartialDelivery(
  supabase: SupabaseClient,
  solicitudId: string
): Promise<PartialDeliveryRow | null> {
  const parsedSolicitudId = parseUuidValue(solicitudId, { name: 'solicitudId' });
  if (!parsedSolicitudId.success) {
    return null;
  }

  const { data, error } = await supabase
    .from('historial_donaciones')
    .select('cantidad_entregada, cantidad_solicitada, porcentaje_entregado, comentario')
    .eq('solicitud_id', parsedSolicitudId.value)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error consultando historial de entregas parciales:', error);
    return null;
  }

  return data as PartialDeliveryRow | null;
}

async function getDonation(
  supabase: SupabaseClient,
  donationId: number
): Promise<DonationRow> {
  const parsedDonationId = parsePositiveIntegerValue(donationId, {
    name: 'donationId',
    min: 1,
    max: 2147483647,
  });
  if (!parsedDonationId.success) {
    throw new NotificationDispatchError(400, 'entityId de donacion invalido.');
  }

  const { data, error } = await supabase
    .from('donaciones')
    .select(`
      id,
      user_id,
      nombre_donante,
      ruc_donante,
      cedula_donante,
      direccion_donante_completa,
      telefono,
      email,
      tipo_producto,
      cantidad,
      unidad_simbolo,
      estado,
      creado_en,
      codigo_comprobante,
      motivo_cancelacion,
      observaciones_cancelacion
    `)
    .eq('id', parsedDonationId.value)
    .maybeSingle();

  if (error) {
    throw new NotificationDispatchError(500, 'No fue posible consultar la donacion.', error);
  }

  if (!data) {
    throw new NotificationDispatchError(404, 'Donacion no encontrada.');
  }

  return data as DonationRow;
}

function unwrapRelatedOne<T>(value: RelatedOne<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
