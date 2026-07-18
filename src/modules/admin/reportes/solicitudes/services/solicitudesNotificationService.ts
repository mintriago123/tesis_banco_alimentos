import type { Solicitud } from '../types';
import {
  generarCodigoComprobante,
  generarDatosComprobante,
  generarQRBase64,
  generarURLComprobante,
} from '@/lib/comprobante';
import {
  buildSolicitudAprobadaEmailTemplate,
  buildSolicitudEntregadaEmailTemplate,
  buildSolicitudRechazadaEmailTemplate,
} from '@/lib/email/templates/solicitudEmail';
import { getBaseUrl } from '@/lib/getBaseUrl';
import { sendNotification } from '@/modules/shared/services/notificationClient';
import { solicitudesLogger, type SolicitudesLogger } from './solicitudesLogger';

export type SolicitudNotifiableEstado = 'aprobada' | 'rechazada' | 'entregada';

export interface SolicitudNotificationOptions {
  mensajeInventario?: string;
  comentarioAdmin?: string;
  motivoRechazo?: string | null;
  codigoComprobanteGuardado?: string | null;
  esParcial?: boolean;
  cantidadParcial?: number;
  cantidadTotal?: number;
}

export const createSolicitudesNotificationService = (
  logger: SolicitudesLogger = solicitudesLogger
) => {
  const notificarCambioEstado = async (
    solicitud: Solicitud,
    nuevoEstado: SolicitudNotifiableEstado,
    options: SolicitudNotificationOptions = {}
  ) => {
    try {
      const {
        comentarioAdmin,
        codigoComprobanteGuardado,
        esParcial,
        cantidadParcial,
        cantidadTotal,
      } = options;
      const baseUrl = getBaseUrl();
      const codigoComprobante = codigoComprobanteGuardado ?? generarCodigoComprobante('solicitud', solicitud.id);

      const datosUsuario = {
        id: solicitud.usuario_id,
        nombre: solicitud.usuarios?.nombre ?? 'Usuario',
        email: solicitud.usuarios?.email ?? '',
        telefono: solicitud.usuarios?.telefono,
        direccion: solicitud.usuarios?.direccion,
        documento: solicitud.usuarios?.cedula,
      };

      const datosPedido = {
        id: solicitud.id,
        tipo: 'solicitud' as const,
        tipoAlimento: solicitud.tipo_alimento,
        cantidad: solicitud.cantidad,
        unidad: solicitud.unidades?.simbolo ?? 'unidades',
        estado: nuevoEstado,
        fechaCreacion: solicitud.created_at,
        fechaAprobacion: new Date().toISOString(),
        comentarioAdmin,
      };

      const comprobante = {
        ...generarDatosComprobante('solicitud', datosUsuario, datosPedido, comentarioAdmin),
        codigoComprobante,
      };

      if (nuevoEstado === 'aprobada') {
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

        let tituloNotificacion: string;
        let mensajeNotificacion: string;

        if (esParcial && cantidadParcial && cantidadTotal) {
          const porcentajeEntregado = Math.round((cantidadParcial / cantidadTotal) * 100);
          tituloNotificacion = `⚠️ Solicitud Aprobada Parcialmente - Código: ${comprobante.codigoComprobante}`;
          mensajeNotificacion = `Estimado/a ${datosUsuario.nombre}, su solicitud ha sido aprobada PARCIALMENTE. Se le entregará ${cantidadParcial} ${datosPedido.unidad} de los ${cantidadTotal} ${datosPedido.unidad} solicitados de ${solicitud.tipo_alimento} (${porcentajeEntregado}% del total). ${comentarioAdmin ? `Comentario del operador: ${comentarioAdmin}.` : ''} Presente el código QR adjunto al momento de retirar los alimentos. Válido hasta: ${new Date(comprobante.fechaVencimiento).toLocaleDateString('es-ES')}.`;
        } else {
          tituloNotificacion = `✅ Solicitud Aprobada - Código: ${comprobante.codigoComprobante}`;
          mensajeNotificacion = `Estimado/a ${datosUsuario.nombre}, su solicitud de ${solicitud.cantidad} ${datosPedido.unidad} de ${solicitud.tipo_alimento} ha sido aprobada. Presente el código QR adjunto al momento de retirar los alimentos. Válido hasta: ${new Date(comprobante.fechaVencimiento).toLocaleDateString('es-ES')}.`;
        }

        await sendNotification({
          titulo: tituloNotificacion,
          mensaje: mensajeNotificacion,
          categoria: 'solicitud',
          tipo: esParcial ? 'warning' : 'success',
          destinatarioId: solicitud.usuario_id,
          urlAccion: '/user/solicitudes',
          metadatos: {
            solicitudId: solicitud.id,
            nuevoEstado,
            codigoComprobante: comprobante.codigoComprobante,
            fechaVencimiento: comprobante.fechaVencimiento,
            esParcial: esParcial ?? false,
            cantidadEntregada: cantidadParcial,
            cantidadSolicitada: cantidadTotal,
          },
          email: {
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            text: emailTemplate.text,
          },
        });
      } else if (nuevoEstado === 'rechazada') {
        const emailTemplate = buildSolicitudRechazadaEmailTemplate({
          comprobante,
          baseUrl,
        });

        await sendNotification({
          titulo: '❌ Solicitud No Aprobada',
          mensaje: comentarioAdmin
            ? `Estimado/a ${datosUsuario.nombre}, lamentamos informarle que su solicitud de ${solicitud.tipo_alimento} no ha sido aprobada. Motivo: ${comentarioAdmin}. Puede realizar una nueva solicitud en cualquier momento.`
            : `Estimado/a ${datosUsuario.nombre}, lamentamos informarle que su solicitud de ${solicitud.tipo_alimento} no ha sido aprobada en esta ocasión. Puede realizar una nueva solicitud en cualquier momento.`,
          categoria: 'solicitud',
          tipo: 'warning',
          destinatarioId: solicitud.usuario_id,
          urlAccion: '/user/formulario',
          metadatos: {
            solicitudId: solicitud.id,
            nuevoEstado,
          },
          email: {
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            text: emailTemplate.text,
          },
        });
      } else if (nuevoEstado === 'entregada') {
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

        await sendNotification({
          titulo: '🎉 Solicitud Procesada y Entregada',
          mensaje:
            `Estimado/a ${datosUsuario.nombre}, su solicitud de ${solicitud.cantidad} ${datosPedido.unidad} de ${solicitud.tipo_alimento} ha sido <strong style="color: #059669;">entregada exitosamente</strong> y procesada por nuestro equipo.\n\n` +
            '¡Gracias por confiar en el Banco de Alimentos! Si tienes dudas o necesitas realizar una nueva solicitud, puedes hacerlo desde la sección de solicitudes.',
          categoria: 'solicitud',
          tipo: 'success',
          destinatarioId: solicitud.usuario_id,
          urlAccion: '/user/solicitudes',
          metadatos: {
            solicitudId: solicitud.id,
            nuevoEstado,
          },
          email: {
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            text: emailTemplate.text,
          },
        });
      }
    } catch (error) {
      logger.error('Error enviando notificación de solicitud', error);
    }
  };

  return {
    notificarCambioEstado,
  };
};

export type SolicitudesNotificationService = ReturnType<typeof createSolicitudesNotificationService>;
