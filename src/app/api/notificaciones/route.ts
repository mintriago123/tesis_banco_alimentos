import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { validateCsrfRequest } from '@/lib/csrf';
import {
  buildNotificationForEvent,
  NotificationDispatchError,
  parseNotificationEventPayload,
} from '@/modules/shared/services/notificationEventDispatcher';
import { NotificationService } from '@/modules/shared/services/notificationService';

async function readJsonBody(request: Request): Promise<{ body: unknown } | { response: NextResponse }> {
  try {
    return { body: await request.json() };
  } catch {
    return { response: NextResponse.json({ error: 'Payload JSON invalido.' }, { status: 400 }) };
  }
}

export async function POST(request: Request) {
  try {
    const csrfResponse = validateCsrfRequest(request);
    if (csrfResponse) {
      return csrfResponse;
    }

    const auth = await requireAuth();
    if (auth.response) {
      return auth.response;
    }

    const jsonBody = await readJsonBody(request);
    if ('response' in jsonBody) {
      return jsonBody.response;
    }

    const payloadResult = parseNotificationEventPayload(jsonBody.body);
    if (!payloadResult.success) {
      return NextResponse.json({ error: payloadResult.error }, { status: 400 });
    }

    const input = await buildNotificationForEvent(auth.profile, payloadResult.payload);
    const service = new NotificationService();
    const notificacion = await service.createNotification(input);

    return NextResponse.json({ notificacion });
  } catch (error) {
    if (error instanceof NotificationDispatchError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Error en POST /api/notificaciones:', error);
    return NextResponse.json({ error: 'Error al crear la notificacion.' }, { status: 500 });
  }
}
