import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { dbAdmin } from '@/db/client';
import { configuracionNotificaciones, notificaciones, usuarios } from '@/db/schema';
import { sendEmail, type EmailOptions } from '@/lib/email';
import { buildNotificationEmailTemplate } from '@/lib/email/templates/notificationEmail';
import { safeInternalPath } from '@/lib/safe-internal-path';
import { isUuid } from '@/lib/validation-core';

type NotificationType = 'info' | 'success' | 'warning' | 'error';
type NotificationEmailOptions = Partial<
  Pick<EmailOptions, 'to' | 'subject' | 'html' | 'text' | 'from' | 'cc' | 'bcc' | 'replyTo' | 'attachments' | 'headers'>
>;

export interface CreateNotificationInput {
  titulo: string;
  mensaje: string;
  tipo?: NotificationType;
  categoria?: string;
  urlAccion?: string;
  destinatarioId?: string;
  rolDestinatario?: string;
  metadatos?: Record<string, unknown>;
  expiraEn?: string;
  enviarEmail?: boolean;
  email?: NotificationEmailOptions;
}

export interface NotificacionRecord {
  id: string;
  titulo: string;
  mensaje: string;
  tipo: NotificationType;
  categoria: string;
  destinatario_id: string | null;
  rol_destinatario: string | null;
  url_accion: string | null;
  metadatos: Record<string, unknown> | null;
  fecha_creacion: string | null;
  expira_en: string | null;
}

interface UsuarioRecord {
  id: string;
  email: string | null;
  nombre: string | null;
  estado: string | null;
  rol: string | null;
  recibir_notificaciones: boolean | null;
}

interface ResolvedRecipient {
  id?: string;
  email: string;
  nombre?: string | null;
}

const DEFAULT_CATEGORY = 'sistema';

export class NotificationService {
  async createNotification(input: CreateNotificationInput): Promise<NotificacionRecord> {
    const categoria = input.categoria ?? DEFAULT_CATEGORY;
    const urlAccion = safeInternalPath(input.urlAccion);

    const [row] = await dbAdmin
      .insert(notificaciones)
      .values({
        titulo: input.titulo,
        mensaje: input.mensaje,
        tipo: input.tipo ?? 'info',
        categoria,
        destinatarioId: input.destinatarioId ?? null,
        rolDestinatario: input.rolDestinatario ?? null,
        urlAccion: urlAccion ?? undefined,
        metadatos: input.metadatos ?? {},
        expiraEn: input.expiraEn ? new Date(input.expiraEn) : null,
      })
      .returning();

    if (!row) {
      throw new Error('No se pudo crear la notificacion.');
    }

    const notificacion: NotificacionRecord = {
      id: row.id,
      titulo: row.titulo,
      mensaje: row.mensaje,
      tipo: (row.tipo as NotificationType) ?? 'info',
      categoria: row.categoria,
      destinatario_id: row.destinatarioId,
      rol_destinatario: row.rolDestinatario,
      url_accion: row.urlAccion,
      metadatos: row.metadatos as Record<string, unknown> | null,
      fecha_creacion: row.fechaCreacion ? row.fechaCreacion.toISOString() : null,
      expira_en: row.expiraEn ? row.expiraEn.toISOString() : null,
    };

    if (input.enviarEmail !== false) {
      await this.dispararCorreo(notificacion, input);
    }

    return notificacion;
  }

  private async dispararCorreo(notificacion: NotificacionRecord, input: CreateNotificationInput) {
    try {
      const categoria = notificacion.categoria ?? DEFAULT_CATEGORY;
      const destinatarios = await this.resolverDestinatarios(notificacion, input, categoria);

      if (destinatarios.length === 0) {
        return;
      }

      const envios = destinatarios.map((destinatario) => {
        const plantilla = buildNotificationEmailTemplate({
          titulo: notificacion.titulo,
          mensaje: notificacion.mensaje,
          categoria,
          urlAccion: notificacion.url_accion,
          destinatarioNombre: destinatario.nombre ?? null,
        });

        const emailOptions: EmailOptions = {
          to: destinatario.email,
          subject: input.email?.subject ?? plantilla.subject,
          html: input.email?.html ?? plantilla.html,
          text: input.email?.text ?? plantilla.text,
          from: input.email?.from,
          cc: input.email?.cc,
          bcc: input.email?.bcc,
          replyTo: input.email?.replyTo,
          attachments: input.email?.attachments,
          headers: input.email?.headers,
        };

        return sendEmail(emailOptions);
      });

      const resultados = await Promise.allSettled(envios);

      resultados.forEach((resultado, index) => {
        if (resultado.status === 'rejected') {
          console.error(`Error enviando correo de notificacion a ${destinatarios[index]?.email}:`, resultado.reason);
        }
      });
    } catch (error) {
      console.error('Error general enviando correos de notificacion:', error);
    }
  }

  private async resolverDestinatarios(
    notificacion: NotificacionRecord,
    input: CreateNotificationInput,
    categoria: string,
  ): Promise<ResolvedRecipient[]> {
    if (input.email?.to) {
      const to = Array.isArray(input.email.to) ? input.email.to : [input.email.to];
      return to.filter(Boolean).map((email) => ({ email }));
    }

    if (input.destinatarioId) {
      const usuario = await this.obtenerUsuarioPorId(input.destinatarioId);
      if (
        !usuario ||
        !usuario.email ||
        (usuario.estado && usuario.estado.toLowerCase() !== 'activo') ||
        usuario.recibir_notificaciones === false
      ) {
        return [];
      }

      const habilitado = await this.estaEmailHabilitado(usuario.id, categoria);
      if (!habilitado) {
        return [];
      }

      return [{ id: usuario.id, email: usuario.email, nombre: usuario.nombre }];
    }

    if (input.rolDestinatario) {
      const usuariosPorRol = await this.obtenerUsuariosPorRol(input.rolDestinatario);
      if (usuariosPorRol.length === 0) {
        return [];
      }
      return this.filtrarPorPreferencias(usuariosPorRol, categoria);
    }

    console.warn(`Notificacion ${notificacion.id} creada sin destinatarioId ni rolDestinatario. No se enviara correo.`);
    return [];
  }

  private async obtenerUsuarioPorId(usuarioId: string): Promise<UsuarioRecord | null> {
    if (!isUuid(usuarioId)) {
      return null;
    }

    const [row] = await dbAdmin
      .select({
        id: usuarios.id,
        email: usuarios.email,
        nombre: usuarios.nombre,
        estado: usuarios.estado,
        rol: usuarios.rol,
        recibir_notificaciones: usuarios.recibirNotificaciones,
      })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    return row ?? null;
  }

  private async obtenerUsuariosPorRol(rol: string): Promise<UsuarioRecord[]> {
    const normalizedRol = rol.toUpperCase();
    const selection = {
      id: usuarios.id,
      email: usuarios.email,
      nombre: usuarios.nombre,
      estado: usuarios.estado,
      rol: usuarios.rol,
      recibir_notificaciones: usuarios.recibirNotificaciones,
    };

    const rows =
      normalizedRol === 'TODOS'
        ? await dbAdmin.select(selection).from(usuarios)
        : await dbAdmin.select(selection).from(usuarios).where(eq(usuarios.rol, normalizedRol));

    return rows;
  }

  private async filtrarPorPreferencias(usuariosList: UsuarioRecord[], categoria: string): Promise<ResolvedRecipient[]> {
    const activosConCorreo = usuariosList.filter((usuario) => {
      if (!usuario.email) return false;
      if (usuario.estado && usuario.estado.toLowerCase() !== 'activo') return false;
      if (usuario.recibir_notificaciones === false) return false;
      return true;
    });

    const ids = activosConCorreo.map((usuario) => usuario.id).filter(isUuid);
    const preferencias = await this.obtenerPreferencias(ids, categoria);

    return activosConCorreo
      .filter((usuario) => preferencias.get(usuario.id) !== false)
      .map((usuario) => ({ id: usuario.id, email: usuario.email as string, nombre: usuario.nombre }));
  }

  private async estaEmailHabilitado(usuarioId: string, categoria: string): Promise<boolean> {
    const preferencias = await this.obtenerPreferencias([usuarioId], categoria);
    return preferencias.get(usuarioId) !== false;
  }

  private async obtenerPreferencias(usuarioIds: string[], categoria: string): Promise<Map<string, boolean>> {
    const mapa = new Map<string, boolean>();
    const idsValidos = usuarioIds.filter(isUuid);

    if (idsValidos.length === 0) {
      return mapa;
    }

    const rows = await dbAdmin
      .select({ usuarioId: configuracionNotificaciones.usuarioId, emailActivo: configuracionNotificaciones.emailActivo })
      .from(configuracionNotificaciones)
      .where(and(inArray(configuracionNotificaciones.usuarioId, idsValidos), eq(configuracionNotificaciones.categoria, categoria)));

    rows.forEach((row) => {
      if (row.usuarioId) mapa.set(row.usuarioId, row.emailActivo ?? true);
    });

    return mapa;
  }
}
