import type { NotificationEventPayload } from './notificationEvents';

type NotificationPayload = NotificationEventPayload;

export async function sendNotification(payload: NotificationPayload) {
  try {
    const response = await fetch('/api/notificaciones', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = errorBody?.error ?? 'No se pudo crear la notificación';
      throw new Error(message);
    }
  } catch (error) {
    console.error('Error enviando notificación:', error);
  }
}
