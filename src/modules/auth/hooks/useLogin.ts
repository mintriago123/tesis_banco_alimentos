'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, getSession } from 'next-auth/react';
import { AUTH_CONSTANTS } from '../constants';
import { RUTA_POR_ROL, type MensajeAuth, type Rol } from '../types';

interface DatosLogin {
  email: string;
  password: string;
}

export function useLogin() {
  const router = useRouter();
  const [estaCargando, setEstaCargando] = useState(false);
  const [mensaje, setMensaje] = useState<MensajeAuth | null>(null);

  const limpiarMensaje = () => setMensaje(null);

  const login = async (datos: DatosLogin) => {
    setEstaCargando(true);
    setMensaje(null);

    try {
      const result = await signIn('credentials', { ...datos, redirect: false });

      if (result?.error) {
        const texto =
          result.code === 'account-blocked'
            ? AUTH_CONSTANTS.MENSAJES.CUENTA_BLOQUEADA
            : result.code === 'account-deactivated'
              ? AUTH_CONSTANTS.MENSAJES.CUENTA_DESACTIVADA
              : AUTH_CONSTANTS.MENSAJES.CREDENCIALES_INVALIDAS;
        setMensaje({ tipo: 'error', texto });
        setEstaCargando(false);
        return;
      }

      const session = await getSession();
      const rol = session?.user?.rol as Rol | null | undefined;
      router.push(rol ? RUTA_POR_ROL[rol] : AUTH_CONSTANTS.RUTAS.COMPLETAR_PERFIL);
      router.refresh();
    } catch {
      setMensaje({ tipo: 'error', texto: AUTH_CONSTANTS.MENSAJES.ERROR_INESPERADO });
      setEstaCargando(false);
    }
  };

  return { login, estaCargando, mensaje, limpiarMensaje };
}
