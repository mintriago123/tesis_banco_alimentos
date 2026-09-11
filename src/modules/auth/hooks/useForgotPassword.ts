'use client';

import { useState } from 'react';
import { solicitarResetPasswordAction } from '../actions/password-reset';
import { AUTH_CONSTANTS } from '../constants';
import type { MensajeAuth } from '../types';

interface DatosRecuperacion {
  email: string;
}

export function useForgotPassword() {
  const [estaCargando, setEstaCargando] = useState(false);
  const [mensaje, setMensaje] = useState<MensajeAuth | null>(null);

  const limpiarMensaje = () => setMensaje(null);

  const enviarRecuperacion = async (datos: DatosRecuperacion) => {
    setEstaCargando(true);
    const result = await solicitarResetPasswordAction(datos.email);
    setEstaCargando(false);

    if (!result.success) {
      setMensaje({ tipo: 'error', texto: result.message });
      return;
    }

    setMensaje({ tipo: 'exito', texto: AUTH_CONSTANTS.MENSAJES.EMAIL_ENVIADO });
  };

  return { enviarRecuperacion, estaCargando, mensaje, limpiarMensaje };
}
