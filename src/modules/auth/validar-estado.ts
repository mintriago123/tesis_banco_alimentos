export type EstadoUsuario = 'activo' | 'bloqueado' | 'desactivado';

export interface PerfilEstado {
  estado: EstadoUsuario | string;
  fechaFinBloqueo: Date | null;
  motivoBloqueo: string | null;
}

export type ValidacionEstado = { ok: true } | { ok: false; message: string };

/**
 * Ports the old `AuthService.validarEstadoUsuario` gate: blocks login for
 * `bloqueado` (temporary or permanent) and `desactivado` accounts, computing
 * remaining time for temporary blocks. A temporary block whose
 * `fechaFinBloqueo` has already passed is treated as expired (login allowed).
 */
export function validarEstadoUsuario(perfil: PerfilEstado): ValidacionEstado {
  if (perfil.estado === 'desactivado') {
    return { ok: false, message: 'Esta cuenta ha sido desactivada. Contacta al administrador para más información.' };
  }

  if (perfil.estado === 'bloqueado') {
    if (perfil.fechaFinBloqueo) {
      const ahora = Date.now();
      const finBloqueo = perfil.fechaFinBloqueo.getTime();

      if (finBloqueo > ahora) {
        const restanteMs = finBloqueo - ahora;
        const horasRestantes = Math.floor(restanteMs / (60 * 60 * 1000));
        const dias = Math.floor(horasRestantes / 24);
        const horas = horasRestantes % 24;
        const tiempo = dias > 0 ? `${dias} día(s) y ${horas} hora(s)` : `${horas} hora(s)`;
        const motivo = perfil.motivoBloqueo ? ` Motivo: ${perfil.motivoBloqueo}.` : '';
        return {
          ok: false,
          message: `Tu cuenta está temporalmente bloqueada. Tiempo restante: ${tiempo}.${motivo}`,
        };
      }

      // Temporary block has expired — treated as no longer blocked.
      return { ok: true };
    }

    const motivo = perfil.motivoBloqueo ? ` Motivo: ${perfil.motivoBloqueo}.` : '';
    return { ok: false, message: `Tu cuenta está bloqueada.${motivo} Contacta al administrador.` };
  }

  return { ok: true };
}
