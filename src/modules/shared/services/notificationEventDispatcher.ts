import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { dbAdmin } from '@/db/client';
import { donaciones, historialDonaciones, solicitudes, solicitudesAltaAlimentos, unidades, usuarios } from '@/db/schema';
import {
  generarCodigoComprobante,
  generarDatosComprobante,
  generarQRBase64,
  generarURLComprobante,
} from '@/lib/comprobante';
import { buildDonacionAprobadaEmailTemplate, buildDonacionCanceladaEmailTemplate } from '@/lib/email/templates/donacionEmail';
import {
  buildSolicitudAprobadaEmailTemplate,
  buildSolicitudEntregadaEmailTemplate,
  buildSolicitudRechazadaEmailTemplate,
} from '@/lib/email/templates/solicitudEmail';
import { getBaseUrl } from '@/lib/getBaseUrl';
import { isPlainObject, type ActiveUserProfile, type AppUserRole } from '@/lib/server-auth';
import type { CreateNotificationInput } from './notificationService';
import {
  isNotificationEventType,
  SENSITIVE_NOTIFICATION_PAYLOAD_FIELDS,
  type NotificationEventPayload,
  type NotificationEventType,
} from './notificationEvents';
import { parsePositiveIntegerValue, parseUuidValue } from '@/lib/validation-core';

type DispatchStatus = 400 | 403 | 404 | 422 | 500;

type ParseNotificationEventPayloadResult = { success: true; payload: NotificationEventPayload } | { success: false; error: string };
type EntityIdValidationResult = { success: true; value: string } | { success: false; error: string };

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
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'NotificationDispatchError';
  }
}

export const parseNotificationEventPayload = (body: unknown): ParseNotificationEventPayloadResult => {
  if (!isPlainObject(body)) {
    return { success: false, error: 'El payload debe ser un objeto.' };
  }

  const sensitiveFields = Object.keys(body).filter((field) =>
    SENSITIVE_NOTIFICATION_PAYLOAD_FIELDS.includes(field as (typeof SENSITIVE_NOTIFICATION_PAYLOAD_FIELDS)[number]),
  );

  if (sensitiveFields.length > 0) {
    return { success: false, error: `Campos no permitidos: ${sensitiveFields.join(', ')}.` };
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

  return { success: true, payload: { event: body.event, entityId: entityId.value } };
};

function validateEntityIdForEvent(event: NotificationEventType, entityId: string): EntityIdValidationResult {
  if (event === 'donation_status_changed') {
    const donationId = parsePositiveIntegerValue(entityId, { name: 'entityId', min: 1, max: 2147483647 });
    return donationId.success
      ? { success: true, value: String(donationId.value) }
      : { success: false, error: 'entityId de donacion invalido.' };
  }

  const uuid = parseUuidValue(entityId, { name: 'entityId' });
  return uuid.success ? { success: true, value: uuid.value } : { success: false, error: 'entityId debe ser un UUID valido para este evento.' };
}

export async function buildNotificationForEvent(
  profile: ActiveUserProfile,
  payload: NotificationEventPayload,
): Promise<CreateNotificationInput> {
  assertRoleAllowed(profile, EVENT_ALLOWED_ROLES[payload.event]);

  switch (payload.event) {
    case 'catalog_food_request_created':
      return buildCatalogFoodRequestCreatedNotification(profile, payload.entityId);
    case 'catalog_food_request_reviewed':
      return buildCatalogFoodRequestReviewedNotification(payload.entityId);
    case 'food_request_status_changed':
      return buildFoodRequestStatusChangedNotification(payload.entityId);
    case 'donation_status_changed':
      return buildDonationStatusChangedNotification(payload.entityId);
  }
}

function assertRoleAllowed(profile: ActiveUserProfile, allowedRoles: readonly AppUserRole[]) {
  if (!allowedRoles.includes(profile.rol)) {
    throw new NotificationDispatchError(403, 'Rol no permitido para este evento.');
  }
}

async function buildCatalogFoodRequestCreatedNotification(
  profile: ActiveUserProfile,
  entityId: string,
): Promise<CreateNotificationInput> {
  const solicitud = await getCatalogFoodRequest(entityId);

  if (solicitud.solicitanteId !== profile.id) {
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
    metadatos: { event: 'catalog_food_request_created', solicitudId: solicitud.id, nombre, categoria, solicitanteId: solicitud.solicitanteId },
  };
}

async function buildCatalogFoodRequestReviewedNotification(entityId: string): Promise<CreateNotificationInput> {
  const solicitud = await getCatalogFoodRequest(entityId);

  if (solicitud.estado === 'pendiente') {
    throw new NotificationDispatchError(422, 'La solicitud de alta aun no fue revisada.');
  }

  const nombre = solicitud.nombre.trim();
  const categoria = solicitud.categoria.trim();
  const aprobada = solicitud.estado === 'aprobada';
  const comentario = solicitud.comentarioAdmin?.trim();

  return {
    titulo: aprobada ? `Solicitud aprobada: ${nombre}` : `Solicitud rechazada: ${nombre}`,
    mensaje: aprobada
      ? `Tu solicitud para registrar "${nombre}" en la categoria "${categoria}" fue aprobada y ya esta disponible en el catalogo.`
      : `Tu solicitud para registrar "${nombre}" en la categoria "${categoria}" fue rechazada.${comentario ? ` Motivo: ${comentario}` : ''}`,
    tipo: aprobada ? 'success' : 'error',
    categoria: 'catalogo',
    destinatarioId: solicitud.solicitanteId,
    urlAccion: '/donante/solicitar-alimento',
    metadatos: { event: 'catalog_food_request_reviewed', solicitudId: solicitud.id, estado: solicitud.estado, tipo: 'solicitud_alta_alimento' },
  };
}

async function buildFoodRequestStatusChangedNotification(entityId: string): Promise<CreateNotificationInput> {
  const solicitud = await getFoodRequest(entityId);

  if (solicitud.estado === 'pendiente') {
    throw new NotificationDispatchError(422, 'La solicitud aun esta pendiente.');
  }

  const unidadSimbolo = solicitud.unidadSimbolo ?? 'unidades';
  const cantidad = toNumber(solicitud.cantidad);
  const cantidadEntregada = toNumber(solicitud.cantidadEntregada);
  const codigoComprobante = solicitud.codigoComprobante ?? generarCodigoComprobante('solicitud', solicitud.id);
  const datosUsuario = {
    id: solicitud.usuarioId,
    nombre: solicitud.usuarioNombre ?? 'Usuario',
    email: solicitud.usuarioEmail ?? '',
    telefono: solicitud.usuarioTelefono ?? undefined,
    direccion: solicitud.usuarioDireccion ?? undefined,
    documento: solicitud.usuarioCedula ?? undefined,
  };
  const datosPedido = {
    id: solicitud.id,
    tipo: 'solicitud' as const,
    tipoAlimento: solicitud.tipoAlimento,
    cantidad,
    unidad: unidadSimbolo,
    estado: solicitud.estado,
    fechaCreacion: solicitud.createdAt,
    fechaAprobacion: new Date().toISOString(),
    comentarioAdmin: solicitud.comentarioAdmin ?? undefined,
  };
  const comprobante = {
    ...generarDatosComprobante('solicitud', datosUsuario, datosPedido, solicitud.comentarioAdmin ?? undefined),
    codigoComprobante,
  };
  const baseUrl = getBaseUrl();

  if (solicitud.estado === 'aprobada') {
    const partialDelivery = await getLatestPartialDelivery(solicitud.id);
    const esParcial = Boolean(solicitud.tieneEntregasParciales) && cantidadEntregada > 0 && cantidadEntregada < cantidad;
    const cantidadParcial = toNumber(partialDelivery?.cantidadEntregada) || cantidadEntregada;
    const porcentajeEntregado = cantidad > 0 ? Math.round((cantidadParcial / cantidad) * 100) : (partialDelivery?.porcentajeEntregado ?? 0);
    const urlComprobante = generarURLComprobante(baseUrl, comprobante.codigoComprobante, 'solicitud', solicitud.usuarioId, solicitud.id);
    const qrImageBase64 = await generarQRBase64(urlComprobante);
    const emailTemplate = buildSolicitudAprobadaEmailTemplate({ comprobante, qrImageBase64, baseUrl });

    return {
      titulo: esParcial
        ? `Solicitud aprobada parcialmente - Codigo: ${comprobante.codigoComprobante}`
        : `Solicitud aprobada - Codigo: ${comprobante.codigoComprobante}`,
      mensaje: esParcial
        ? `Estimado/a ${datosUsuario.nombre}, su solicitud fue aprobada parcialmente. Se le entregara ${cantidadParcial} ${unidadSimbolo} de los ${cantidad} ${unidadSimbolo} solicitados de ${solicitud.tipoAlimento} (${porcentajeEntregado}% del total).${solicitud.comentarioAdmin ? ` Comentario del operador: ${solicitud.comentarioAdmin}.` : ''} Presente el codigo QR adjunto al momento de retirar los alimentos. Valido hasta: ${new Date(comprobante.fechaVencimiento).toLocaleDateString('es-ES')}.`
        : `Estimado/a ${datosUsuario.nombre}, su solicitud de ${cantidad} ${unidadSimbolo} de ${solicitud.tipoAlimento} ha sido aprobada. Presente el codigo QR adjunto al momento de retirar los alimentos. Valido hasta: ${new Date(comprobante.fechaVencimiento).toLocaleDateString('es-ES')}.`,
      categoria: 'solicitud',
      tipo: esParcial ? 'warning' : 'success',
      destinatarioId: solicitud.usuarioId,
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
    const emailTemplate = buildSolicitudRechazadaEmailTemplate({ comprobante, baseUrl });

    return {
      titulo: 'Solicitud no aprobada',
      mensaje: solicitud.comentarioAdmin
        ? `Estimado/a ${datosUsuario.nombre}, lamentamos informarle que su solicitud de ${solicitud.tipoAlimento} no ha sido aprobada. Motivo: ${solicitud.comentarioAdmin}. Puede realizar una nueva solicitud en cualquier momento.`
        : `Estimado/a ${datosUsuario.nombre}, lamentamos informarle que su solicitud de ${solicitud.tipoAlimento} no ha sido aprobada en esta ocasion. Puede realizar una nueva solicitud en cualquier momento.`,
      categoria: 'solicitud',
      tipo: 'warning',
      destinatarioId: solicitud.usuarioId,
      urlAccion: '/user/formulario',
      metadatos: { event: 'food_request_status_changed', solicitudId: solicitud.id, nuevoEstado: solicitud.estado, motivoRechazo: solicitud.motivoRechazo ?? undefined },
      email: emailTemplate,
    };
  }

  const urlComprobante = generarURLComprobante(baseUrl, comprobante.codigoComprobante, 'solicitud', solicitud.usuarioId, solicitud.id);
  const qrImageBase64 = await generarQRBase64(urlComprobante);
  const emailTemplate = buildSolicitudEntregadaEmailTemplate({ comprobante, qrImageBase64, baseUrl });

  return {
    titulo: 'Solicitud procesada y entregada',
    mensaje: `Estimado/a ${datosUsuario.nombre}, su solicitud de ${cantidad} ${unidadSimbolo} de ${solicitud.tipoAlimento} ha sido entregada exitosamente y procesada por nuestro equipo.\n\nGracias por confiar en el Banco de Alimentos. Si tiene dudas o necesita realizar una nueva solicitud, puede hacerlo desde la seccion de solicitudes.`,
    categoria: 'solicitud',
    tipo: 'success',
    destinatarioId: solicitud.usuarioId,
    urlAccion: '/user/solicitudes',
    metadatos: { event: 'food_request_status_changed', solicitudId: solicitud.id, nuevoEstado: solicitud.estado },
    email: emailTemplate,
  };
}

async function buildDonationStatusChangedNotification(entityId: string): Promise<CreateNotificationInput> {
  const donationId = parsePositiveIntegerValue(entityId, { name: 'entityId', min: 1, max: 2147483647 });
  if (!donationId.success) {
    throw new NotificationDispatchError(400, 'entityId de donacion invalido.');
  }

  const donation = await getDonation(donationId.value);

  if (!donation.userId) {
    throw new NotificationDispatchError(422, 'La donacion no tiene donante asociado.');
  }

  const donorId = parseUuidValue(donation.userId, { name: 'user_id' });
  if (!donorId.success) {
    throw new NotificationDispatchError(422, 'La donacion tiene un donante invalido.');
  }

  const baseUrl = getBaseUrl();
  const cantidad = toNumber(donation.cantidad);
  const codigoComprobante = donation.codigoComprobante ?? generarCodigoComprobante('donacion', String(donation.id));
  const datosUsuario = {
    id: donorId.value,
    nombre: donation.nombreDonante,
    email: donation.email,
    telefono: donation.telefono ?? undefined,
    direccion: donation.direccionDonanteCompleta ?? undefined,
    documento: donation.cedulaDonante ?? donation.rucDonante ?? undefined,
  };
  const datosPedido = {
    id: String(donation.id),
    tipo: 'donacion' as const,
    tipoAlimento: donation.tipoProducto,
    cantidad,
    unidad: donation.unidadSimbolo ?? 'unidades',
    estado: donation.estado,
    fechaCreacion: donation.creadoEn,
    fechaAprobacion: new Date().toISOString(),
  };
  const comprobante = { ...generarDatosComprobante('donacion', datosUsuario, datosPedido), codigoComprobante };

  if (donation.estado === 'Cancelada') {
    const motivoTexto = donation.motivoCancelacion ? ` Motivo: ${donation.motivoCancelacion.replace(/_/g, ' ')}` : '';
    const observacionesTexto = donation.observacionesCancelacion ? ` Detalles: ${donation.observacionesCancelacion}` : '';
    const emailTemplate = buildDonacionCanceladaEmailTemplate({
      comprobante: { ...comprobante, pedido: { ...comprobante.pedido, comentarioAdmin: donation.observacionesCancelacion ?? undefined } },
      baseUrl,
    });

    return {
      titulo: 'Donacion cancelada',
      mensaje: `Estimado/a ${datosUsuario.nombre}, le informamos que su donacion de ${donation.tipoProducto} ha sido cancelada.${motivoTexto}${observacionesTexto} Si tiene alguna duda, no dude en contactarnos.`,
      categoria: 'donacion',
      tipo: 'warning',
      destinatarioId: donorId.value,
      urlAccion: '/donante/nueva-donacion',
      metadatos: {
        event: 'donation_status_changed',
        donacionId: donation.id,
        nuevoEstado: donation.estado,
        motivoCancelacion: donation.motivoCancelacion ?? undefined,
        observacionesCancelacion: donation.observacionesCancelacion ?? undefined,
      },
      email: emailTemplate,
    };
  }

  const urlComprobante = generarURLComprobante(baseUrl, comprobante.codigoComprobante, 'donacion', donorId.value, String(donation.id));
  const qrImageBase64 = await generarQRBase64(urlComprobante);
  const emailTemplate = buildDonacionAprobadaEmailTemplate({ comprobante, qrImageBase64, baseUrl });

  if (donation.estado === 'Aprobada') {
    return {
      titulo: `Donacion aprobada - Codigo: ${comprobante.codigoComprobante}`,
      mensaje: `Estimado/a ${datosUsuario.nombre}, su donacion de ${cantidad} ${datosPedido.unidad} de ${donation.tipoProducto} ha sido aprobada e incorporada a nuestro inventario. Gracias por su generosidad. Su aporte ayudara a familias que lo necesitan.`,
      categoria: 'donacion',
      tipo: 'success',
      destinatarioId: donorId.value,
      urlAccion: '/donante/donaciones',
      metadatos: { event: 'donation_status_changed', donacionId: donation.id, nuevoEstado: donation.estado, codigoComprobante: comprobante.codigoComprobante },
      email: emailTemplate,
    };
  }

  return {
    titulo: `Donacion registrada - Codigo: ${comprobante.codigoComprobante}`,
    mensaje: `Estimado/a ${datosUsuario.nombre}, su donacion de ${cantidad} ${datosPedido.unidad} de ${donation.tipoProducto} ha sido registrada. Nuestro equipo la procesara pronto.`,
    categoria: 'donacion',
    tipo: 'info',
    destinatarioId: donorId.value,
    urlAccion: '/donante/donaciones',
    metadatos: { event: 'donation_status_changed', donacionId: donation.id, nuevoEstado: donation.estado, codigoComprobante: comprobante.codigoComprobante },
    email: emailTemplate,
  };
}

async function getCatalogFoodRequest(entityId: string) {
  const solicitudId = parseUuidValue(entityId, { name: 'entityId' });
  if (!solicitudId.success) {
    throw new NotificationDispatchError(400, 'entityId debe ser un UUID valido para este evento.');
  }

  const [row] = await dbAdmin
    .select({
      id: solicitudesAltaAlimentos.id,
      solicitanteId: solicitudesAltaAlimentos.solicitanteId,
      nombre: solicitudesAltaAlimentos.nombre,
      categoria: solicitudesAltaAlimentos.categoria,
      estado: solicitudesAltaAlimentos.estado,
      comentarioAdmin: solicitudesAltaAlimentos.comentarioAdmin,
    })
    .from(solicitudesAltaAlimentos)
    .where(eq(solicitudesAltaAlimentos.id, solicitudId.value))
    .limit(1);

  if (!row) {
    throw new NotificationDispatchError(404, 'Solicitud de alta no encontrada.');
  }

  return row as typeof row & { estado: 'pendiente' | 'aprobada' | 'rechazada' };
}

async function getFoodRequest(entityId: string) {
  const solicitudId = parseUuidValue(entityId, { name: 'entityId' });
  if (!solicitudId.success) {
    throw new NotificationDispatchError(400, 'entityId debe ser un UUID valido para este evento.');
  }

  const [row] = await dbAdmin
    .select({
      id: solicitudes.id,
      usuarioId: solicitudes.usuarioId,
      tipoAlimento: solicitudes.tipoAlimento,
      cantidad: solicitudes.cantidad,
      estado: solicitudes.estado,
      createdAt: solicitudes.createdAt,
      comentarioAdmin: solicitudes.comentarioAdmin,
      motivoRechazo: solicitudes.motivoRechazo,
      codigoComprobante: solicitudes.codigoComprobante,
      cantidadEntregada: solicitudes.cantidadEntregada,
      tieneEntregasParciales: solicitudes.tieneEntregasParciales,
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
    .where(eq(solicitudes.id, solicitudId.value))
    .limit(1);

  if (!row) {
    throw new NotificationDispatchError(404, 'Solicitud no encontrada.');
  }

  return row as typeof row & { estado: 'pendiente' | 'aprobada' | 'rechazada' | 'entregada'; createdAt: string };
}

async function getLatestPartialDelivery(solicitudId: string) {
  const parsedSolicitudId = parseUuidValue(solicitudId, { name: 'solicitudId' });
  if (!parsedSolicitudId.success) {
    return null;
  }

  const [row] = await dbAdmin
    .select({
      cantidadEntregada: historialDonaciones.cantidadEntregada,
      cantidadSolicitada: historialDonaciones.cantidadSolicitada,
      porcentajeEntregado: historialDonaciones.porcentajeEntregado,
      comentario: historialDonaciones.comentario,
    })
    .from(historialDonaciones)
    .where(eq(historialDonaciones.solicitudId, parsedSolicitudId.value))
    .orderBy(desc(historialDonaciones.createdAt))
    .limit(1);

  return row ?? null;
}

async function getDonation(donationId: number) {
  const [row] = await dbAdmin.select().from(donaciones).where(eq(donaciones.id, donationId)).limit(1);

  if (!row) {
    throw new NotificationDispatchError(404, 'Donacion no encontrada.');
  }

  return row as typeof row & { estado: 'Pendiente' | 'Aprobada' | 'Cancelada'; creadoEn: string };
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
