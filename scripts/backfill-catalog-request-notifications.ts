import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type SolicitudAltaAlimentoRow = {
  id: string;
  solicitante_id: string;
  nombre: string;
  categoria: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  comentario_admin: string | null;
  created_at: string;
  fecha_revision: string | null;
};

async function notificationExists(
  supabase: SupabaseClient,
  solicitudId: string,
  evento: 'creada' | 'revisada',
  estado?: 'aprobada' | 'rechazada'
) {
  let query = supabase
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .contains('metadatos', {
      tipo: 'solicitud_alta_alimento',
      solicitudId,
      evento,
    });

  if (estado) {
    query = query.contains('metadatos', { estado });
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return (count ?? 0) > 0;
}

function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL no está configurada.');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function createNotification(
  supabase: SupabaseClient,
  input: {
    titulo: string;
    mensaje: string;
    tipo: 'info' | 'success' | 'error';
    categoria: string;
    destinatarioId?: string;
    rolDestinatario?: string;
    urlAccion?: string;
    metadatos: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from('notificaciones').insert({
    titulo: input.titulo,
    mensaje: input.mensaje,
    tipo: input.tipo,
    categoria: input.categoria,
    destinatario_id: input.destinatarioId ?? null,
    rol_destinatario: input.rolDestinatario ?? null,
    url_accion: input.urlAccion ?? null,
    metadatos: input.metadatos,
    fecha_creacion: new Date().toISOString(),
    activa: true,
  });

  if (error) {
    throw error;
  }
}

async function main() {
  const supabase = createAdminSupabaseClient();

  const { data: solicitudes, error } = await supabase
    .from('solicitudes_alta_alimentos')
    .select('id, solicitante_id, nombre, categoria, estado, comentario_admin, created_at, fecha_revision')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (solicitudes ?? []) as SolicitudAltaAlimentoRow[];

  let createdBackfilled = 0;
  let reviewedBackfilled = 0;

  for (const solicitud of rows) {
    const alreadyCreated = await notificationExists(supabase, solicitud.id, 'creada');

    if (!alreadyCreated) {
      await createNotification(supabase, {
        titulo: `Nueva solicitud de alta: ${solicitud.nombre.trim()}`,
        mensaje: `Un donante solicitó registrar "${solicitud.nombre.trim()}" en la categoría "${solicitud.categoria.trim()}".`,
        tipo: 'info',
        categoria: 'catalogo',
        rolDestinatario: 'ADMINISTRADOR',
        urlAccion: '/admin/catalogo',
        enviarEmail: false,
        metadatos: {
          tipo: 'solicitud_alta_alimento',
          evento: 'creada',
          solicitudId: solicitud.id,
          nombre: solicitud.nombre.trim(),
          categoria: solicitud.categoria.trim(),
          solicitanteId: solicitud.solicitante_id,
          fechaSolicitud: solicitud.created_at,
        },
      });

      createdBackfilled += 1;
    }

    if (solicitud.estado === 'aprobada' || solicitud.estado === 'rechazada') {
      const alreadyReviewed = await notificationExists(supabase, solicitud.id, 'revisada', solicitud.estado);

      if (!alreadyReviewed) {
        const mensaje =
          solicitud.estado === 'aprobada'
            ? `Tu solicitud para registrar "${solicitud.nombre.trim()}" en la categoría "${solicitud.categoria.trim()}" fue aprobada y ya está disponible en el catálogo.`
            : `Tu solicitud para registrar "${solicitud.nombre.trim()}" en la categoría "${solicitud.categoria.trim()}" fue rechazada.${solicitud.comentario_admin?.trim() ? ` Motivo: ${solicitud.comentario_admin.trim()}` : ''}`;

        await createNotification(supabase, {
          titulo:
            solicitud.estado === 'aprobada'
              ? `Solicitud aprobada: ${solicitud.nombre.trim()}`
              : `Solicitud rechazada: ${solicitud.nombre.trim()}`,
          mensaje,
          tipo: solicitud.estado === 'aprobada' ? 'success' : 'error',
          categoria: 'catalogo',
          destinatarioId: solicitud.solicitante_id,
          urlAccion: '/donante/solicitar-alimento',
          enviarEmail: false,
          metadatos: {
            tipo: 'solicitud_alta_alimento',
            evento: 'revisada',
            solicitudId: solicitud.id,
            estado: solicitud.estado,
            solicitanteId: solicitud.solicitante_id,
            fechaRevision: solicitud.fecha_revision,
          },
        });

        reviewedBackfilled += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        totalSolicitudes: rows.length,
        notificacionesCreacionGeneradas: createdBackfilled,
        notificacionesRevisionGeneradas: reviewedBackfilled,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('Error ejecutando backfill de notificaciones históricas:', error);
  process.exit(1);
});
