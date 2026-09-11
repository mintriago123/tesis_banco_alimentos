export const NOTIFICATION_EVENT_TYPES = [
  'catalog_food_request_created',
  'catalog_food_request_reviewed',
  'food_request_status_changed',
  'donation_status_changed',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export interface NotificationEventPayload {
  event: NotificationEventType;
  entityId: string;
}

export const SENSITIVE_NOTIFICATION_PAYLOAD_FIELDS = [
  'titulo',
  'mensaje',
  'tipo',
  'categoria',
  'destinatarioId',
  'destinatario_id',
  'rolDestinatario',
  'rol_destinatario',
  'email',
  'metadatos',
  'metadata',
  'urlAccion',
  'url_accion',
  'expiraEn',
  'expira_en',
  'enviarEmail',
  'enviar_email',
] as const;

export const isNotificationEventType = (value: unknown): value is NotificationEventType =>
  typeof value === 'string' && NOTIFICATION_EVENT_TYPES.includes(value as NotificationEventType);
