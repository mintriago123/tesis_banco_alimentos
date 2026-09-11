import { ROLES_REGISTRABLES } from './types';

export const AUTH_CONSTANTS = {
  MIN_PASSWORD_LENGTH: 6,
  MAX_PASSWORD_LENGTH: 100,

  MENSAJES: {
    REGISTRO_EXITOSO: '¡Registro exitoso! Ahora puedes iniciar sesión.',
    CUENTA_BLOQUEADA: 'Tu cuenta ha sido bloqueada. Contacta al administrador para más información.',
    CUENTA_DESACTIVADA: 'Tu cuenta ha sido desactivada. Contacta al administrador para reactivarla.',
    EMAIL_ENVIADO: 'Se ha enviado un enlace de restablecimiento a tu correo electrónico. Por favor, revisa tu bandeja de entrada.',
    PASSWORD_ACTUALIZADO: 'Contraseña actualizada exitosamente. Serás redirigido al inicio de sesión.',
    ENLACE_INVALIDO: 'El enlace de restablecimiento no es válido o ha expirado.',
    ERROR_INESPERADO: 'Ocurrió un error inesperado.',
    ROL_REQUERIDO: 'Debes seleccionar un rol',
    CREDENCIALES_INVALIDAS: 'Correo electrónico o contraseña incorrectos.',
  },

  RUTAS: {
    INICIAR_SESION: '/auth/iniciar-sesion',
    REGISTRAR: '/auth/registrar',
    OLVIDE_CONTRASENA: '/auth/olvide-contrasena',
    RESTABLECER_CONTRASENA: '/auth/restablecer-contrasena',
    COMPLETAR_PERFIL: '/perfil/completar',
    HOME: '/',
  },
} as const;

export const ROLES_INFO = [
  {
    valor: ROLES_REGISTRABLES[0],
    titulo: 'Soy un Donante',
    descripcion: 'Quiero ofrecer productos y ayuda.',
  },
  {
    valor: ROLES_REGISTRABLES[1],
    titulo: 'Soy un Solicitante',
    descripcion: 'Necesito recibir productos y ayuda.',
  },
] as const;
