import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';
import {
  buildNotificationForEvent,
  NotificationDispatchError,
  parseNotificationEventPayload,
} from '@/modules/shared/services/notificationEventDispatcher';
import { NotificationService } from '@/modules/shared/services/notificationService';
import { validateCsrfRequest } from '@/lib/csrf';

async function readJsonBody(request: Request): Promise<{ body: unknown } | { response: NextResponse }> {
  try {
    return { body: await request.json() };
  } catch {
    return {
      response: NextResponse.json({ error: 'Payload JSON invalido.' }, { status: 400 }),
    };
  }
}

export async function POST(request: Request) {
  try {
    const csrfResponse = validateCsrfRequest(request);
    if (csrfResponse) {
      return csrfResponse;
    }

    const supabase = await createServerSupabaseClient();
    const auth = await requireAuth(supabase);

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

    const adminSupabase = createAdminSupabaseClient();

    const input = await buildNotificationForEvent(
      adminSupabase,
      auth.profile,
      payloadResult.payload
    );
    const service = new NotificationService(adminSupabase);
    const notificacion = await service.createNotification(input);

    return NextResponse.json({ notificacion });
  } catch (error) {
    if (error instanceof NotificationDispatchError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Error en POST /api/notificaciones:', error);
    return NextResponse.json(
      { error: 'Error al crear la notificacion.' },
      { status: 500 }
    );
  }
}
