'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { restablecerPasswordAction } from '../actions/password-reset';
import { AUTH_CONSTANTS } from '../constants';
import type { MensajeAuth } from '../types';

interface DatosRestablecimiento {
  password: string;
  confirmPassword: string;
}

/**
 * The old Supabase flow put the browser into an authenticated "recovery"
 * session when the reset link was clicked, so there was an async
 * `verificarSesion()` check on mount. This app's reset flow instead carries
 * a one-time token in the URL (`?token=...`) that the server validates on
 * submit — there's nothing to verify ahead of time, so `verificandoSesion`
 * is always `false` and `sesionValida` just reflects "is a token present".
 */
export function useResetPassword() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [estaCargando, setEstaCargando] = useState(false);
  const [mensaje, setMensaje] = useState<MensajeAuth | null>(
    token ? null : { tipo: 'error', texto: AUTH_CONSTANTS.MENSAJES.ENLACE_INVALIDO },
  );

  const limpiarMensaje = () => setMensaje(null);

  const restablecerContrasena = async (datos: DatosRestablecimiento) => {
    if (!token) {
      setMensaje({ tipo: 'error', texto: AUTH_CONSTANTS.MENSAJES.ENLACE_INVALIDO });
      return;
    }

    setEstaCargando(true);
    const result = await restablecerPasswordAction({ token, ...datos });
    setEstaCargando(false);

    if (!result.success) {
      setMensaje({ tipo: 'error', texto: result.message });
      return;
    }

    setMensaje({ tipo: 'exito', texto: AUTH_CONSTANTS.MENSAJES.PASSWORD_ACTUALIZADO });
  };

  return {
    restablecerContrasena,
    estaCargando,
    mensaje,
    sesionValida: Boolean(token),
    verificandoSesion: false,
    limpiarMensaje,
  };
}
