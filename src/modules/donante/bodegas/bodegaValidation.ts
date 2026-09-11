import type { BodegaFormErrors, BodegaSolicitudInput } from '@/modules/shared/bodegas';

export const validateBodegaInput = (input: BodegaSolicitudInput): BodegaFormErrors => {
  const errors: BodegaFormErrors = {};
  const nombre = input.nombre.trim();
  const direccion = input.direccion.trim();
  const telefono = input.telefono.trim();

  if (nombre.length < 2 || nombre.length > 150) {
    errors.nombre = 'El nombre debe tener entre 2 y 150 caracteres.';
  }
  if (direccion.length < 5 || direccion.length > 250) {
    errors.direccion = 'La dirección debe tener entre 5 y 250 caracteres.';
  }
  if (telefono.length < 7 || telefono.length > 30) {
    errors.telefono = 'Ingresa un teléfono válido.';
  }
  if (input.tipo === 'MODIFICACION' && !input.idDeposito) {
    errors.general = 'Selecciona la bodega que deseas modificar.';
  }

  return errors;
};
