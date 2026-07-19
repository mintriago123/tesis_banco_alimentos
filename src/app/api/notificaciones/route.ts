import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import {
  getActiveUserProfile,
  getAuthenticatedUser,
} from '@/lib/server-auth';
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
    return {
      response: NextResponse.json({ error: 'Payload JSON invalido.' }, { status: 400 }),
    };
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const authResult = await getAuthenticatedUser(supabase);

    if (authResult.response) {
      return authResult.response;
    }

    const adminSupabase = createAdminSupabaseClient();
    const profileResult = await getActiveUserProfile(adminSupabase, authResult.user.id);

    if (profileResult.response) {
      return profileResult.response;
    }

    const jsonBody = await readJsonBody(request);

    if ('response' in jsonBody) {
      return jsonBody.response;
    }

    const payloadResult = parseNotificationEventPayload(jsonBody.body);

    if (!payloadResult.success) {
      return NextResponse.json({ error: payloadResult.error }, { status: 400 });
    }

    const input = await buildNotificationForEvent(
      adminSupabase,
      profileResult.profile,
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
