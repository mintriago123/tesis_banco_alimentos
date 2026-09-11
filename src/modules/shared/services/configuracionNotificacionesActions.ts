'use server';

import { eq } from 'drizzle-orm';
import { withRlsContext } from '@/db/client';
import { configuracionNotificaciones } from '@/db/schema';
import { requireAuth } from '@/lib/server-auth';

export interface ConfiguracionNotificacionRow {
  categoria: string;
  email_activo: boolean;
  push_activo: boolean;
  sonido_activo: boolean;
}

export async function fetchConfiguracionNotificacionesAction(): Promise<ConfiguracionNotificacionRow[]> {
  const auth = await requireAuth();
  if (auth.response) return [];

  return withRlsContext(auth.profile.id, async (tx) => {
    const rows = await tx
      .select({ categoria: configuracionNotificaciones.categoria, email_activo: configuracionNotificaciones.emailActivo, push_activo: configuracionNotificaciones.pushActivo, sonido_activo: configuracionNotificaciones.sonidoActivo })
      .from(configuracionNotificaciones)
      .where(eq(configuracionNotificaciones.usuarioId, auth.profile.id));

    return rows.map((row) => ({
      categoria: row.categoria,
      email_activo: row.email_activo ?? true,
      push_activo: row.push_activo ?? true,
      sonido_activo: row.sonido_activo ?? true,
    }));
  });
}

export async function actualizarConfiguracionNotificacionAction(
  categoria: string,
  config: Partial<Pick<ConfiguracionNotificacionRow, 'email_activo' | 'push_activo' | 'sonido_activo'>>,
): Promise<boolean> {
  const auth = await requireAuth();
  if (auth.response) return false;

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      await tx
        .insert(configuracionNotificaciones)
        .values({
          usuarioId: auth.profile.id,
          categoria,
          emailActivo: config.email_activo ?? true,
          pushActivo: config.push_activo ?? true,
          sonidoActivo: config.sonido_activo ?? true,
          fechaActualizacion: new Date(),
        })
        .onConflictDoUpdate({
          target: [configuracionNotificaciones.usuarioId, configuracionNotificaciones.categoria],
          set: {
            ...(config.email_activo !== undefined ? { emailActivo: config.email_activo } : {}),
            ...(config.push_activo !== undefined ? { pushActivo: config.push_activo } : {}),
            ...(config.sonido_activo !== undefined ? { sonidoActivo: config.sonido_activo } : {}),
            fechaActualizacion: new Date(),
          },
        });
      return true;
    } catch (error) {
      console.error('Error al actualizar configuración de notificaciones:', error);
      return false;
    }
  });
}
