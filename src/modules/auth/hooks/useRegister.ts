'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registrarAction } from '../actions/register';
import { AUTH_CONSTANTS } from '../constants';
import type { MensajeAuth, Rol } from '../types';

interface DatosRegistro {
  email: string;
  password: string;
  confirmPassword: string;
  rol: Rol;
}

export function useRegister() {
  const router = useRouter();
  const [estaCargando, setEstaCargando] = useState(false);
  const [mensaje, setMensaje] = useState<MensajeAuth | null>(null);
  const [registroExitoso, setRegistroExitoso] = useState(false);

  const limpiarMensaje = () => setMensaje(null);

  const registrar = async (datos: DatosRegistro) => {
    setEstaCargando(true);
    setMensaje(null);

    const result = await registrarAction(datos);
    setEstaCargando(false);

    if (!result.success) {
      setMensaje({ tipo: 'error', texto: result.message });
      return;
    }

    setMensaje({ tipo: 'exito', texto: AUTH_CONSTANTS.MENSAJES.REGISTRO_EXITOSO });
    setRegistroExitoso(true);
  };

  const irALogin = () => router.push(AUTH_CONSTANTS.RUTAS.INICIAR_SESION);

  return { registrar, estaCargando, mensaje, registroExitoso, irALogin, limpiarMensaje };
}
