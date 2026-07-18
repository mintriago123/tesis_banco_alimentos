import type { ResultadoInventario, Solicitud } from '../types';

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
