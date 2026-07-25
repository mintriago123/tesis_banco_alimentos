import type { ResultadoInventario, Solicitud } from '../types';

const extractErrorMessage = (errorDetails: unknown): string | null => {
  if (typeof errorDetails === 'string') {
    return errorDetails;
  }

  if (errorDetails instanceof Error) {
    return errorDetails.message;
  }

  if (errorDetails && typeof errorDetails === 'object') {
    const message = Reflect.get(errorDetails, 'message');
    return typeof message === 'string' ? message : null;
  }

  return null;
};

export const buildInventoryDiscountError = (
  errorDetails: unknown,
  fallback: string,
): string => {
  const message = extractErrorMessage(errorDetails);
  if (!message) return fallback;

  const decimalUnitMatch = message.match(/^La unidad (.+?) no permite cantidades decimales/i);
  if (decimalUnitMatch) {
    const unidad = decimalUnitMatch[1].trim();
    return `${message}. Ingresa una cantidad entera (por ejemplo, 1 ${unidad.toLowerCase()}).`;
  }

  if (/no existe conversión/i.test(message)) {
    return 'No se puede registrar la entrega porque la unidad solicitada no tiene una conversión registrada para ese inventario.';
  }

  if (/stock insuficiente/i.test(message)) {
    return 'La cantidad solicitada supera el stock disponible en la bodega seleccionada.';
  }

  return fallback;
};

export const buildResultadoMensaje = (solicitud: Solicitud, resultado: ResultadoInventario) => {
  if (resultado.error) {
    return 'Solicitud aprobada, pero ocurrió un error al actualizar el inventario.';
  }

  if (resultado.noStock) {
    return `Solicitud aprobada, pero no hay inventario disponible para "${solicitud.tipo_alimento}".`;
  }

  if (resultado.cantidadRestante > 0) {
    const entregado = solicitud.cantidad - resultado.cantidadRestante;
    return `Solicitud aprobada parcialmente. Se entregaron ${entregado} de ${solicitud.cantidad} unidades.`;
  }

  return 'Solicitud aprobada y descontada del inventario exitosamente.';
};
