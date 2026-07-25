import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RUTAS_PUBLICAS } from '@/lib/constantes';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code?: string }).code;
  }
  return undefined;
};

type ProxyUserProfile = {
  estado?: string | null;
  rol?: string | null;
  nombre?: string | null;
  cedula?: string | null;
  ruc?: string | null;
};

const SHARED_PRIVATE_ROUTES = [
  '/perfil/actualizar',
  '/notificaciones',
  '/configuracion-notificaciones',
  '/comprobante',
] as const;

const ROLE_PROTECTED_ROUTES = [
  { route: '/admin', role: 'ADMINISTRADOR' },
  { route: '/operador', role: 'OPERADOR' },
  { route: '/donante', role: 'DONANTE' },
  { route: '/user', role: 'SOLICITANTE' },
] as const;

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isProfileComplete = (perfil: ProxyUserProfile) =>
  hasText(perfil.rol) && hasText(perfil.nombre) && (hasText(perfil.cedula) || hasText(perfil.ruc));

const isCompletarPerfilPath = (pathname: string) =>
  pathname === '/perfil/completar' || pathname.startsWith('/perfil/completar/');

const isRouteMatch = (pathname: string, route: string) =>
  route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`);

const isAnyRouteMatch = (pathname: string, routes: readonly string[]) =>
  routes.some((route) => isRouteMatch(pathname, route));

const getRoleAccessForPath = (pathname: string) =>
  ROLE_PROTECTED_ROUTES.find(({ route }) => isRouteMatch(pathname, route));

const isInactiveStatus = (estado: string | null | undefined) =>
  estado === 'bloqueado' || estado === 'desactivado';

const requestedPath = (request: NextRequest) =>
  `${request.nextUrl.pathname}${request.nextUrl.search}`;

const redirectToLogin = (
  request: NextRequest,
  options: { callbackUrl?: string; error?: string } = {}
) => {
  const url = new URL('/auth/iniciar-sesion', request.url);

  if (options.callbackUrl) {
    url.searchParams.set('callbackUrl', options.callbackUrl);
  }

  if (options.error) {
    url.searchParams.set('error', options.error);
  }

  return NextResponse.redirect(url);
};

const redirectAfterInactiveProfile = async (
  supabase: ServerSupabaseClient,
  request: NextRequest,
  estado: string
) => {
  await supabase.auth.signOut();
  return redirectToLogin(request, {
    error: estado === 'bloqueado' ? 'blocked' : 'deactivated',
  });
};

const dashboardUrlForRole = (rol: string, requestUrl: string) => {
  if (rol === 'ADMINISTRADOR') return new URL('/admin/dashboard', requestUrl);
  if (rol === 'OPERADOR') return new URL('/operador/dashboard', requestUrl);
  if (rol === 'DONANTE') return new URL('/donante/dashboard', requestUrl);
  return new URL('/user/dashboard', requestUrl);
};

const getCurrentProfile = async (supabase: ServerSupabaseClient, userId: string) => {
  const { data: perfil, error } = await supabase
    .from('usuarios')
    .select('estado, rol, nombre, cedula, ruc')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return perfil as ProxyUserProfile | null;
};

const protectPrivateRoute = async (
  request: NextRequest,
  supabase: ServerSupabaseClient,
  user: User | null,
  supabaseResponse: NextResponse,
  requiredRole?: string
) => {
  if (!user) {
    return redirectToLogin(request, {
      callbackUrl: requestedPath(request),
      error: 'unauthorized',
    });
  }

  try {
    const perfil = await getCurrentProfile(supabase, user.id);

    if (!perfil) {
      return NextResponse.redirect(new URL('/perfil/completar', request.url));
    }

    const estadoUsuario = perfil.estado || 'activo';

    if (isInactiveStatus(estadoUsuario)) {
      return redirectAfterInactiveProfile(supabase, request, estadoUsuario);
    }

    if (!isProfileComplete(perfil)) {
      return NextResponse.redirect(new URL('/perfil/completar', request.url));
    }

    if (requiredRole && perfil.rol !== requiredRole) {
      return redirectToLogin(request, { error: 'forbidden' });
    }

    if (request.nextUrl.pathname === '/dashboard') {
      return NextResponse.redirect(dashboardUrlForRole(perfil.rol ?? '', request.url));
    }

    return supabaseResponse;
  } catch (error) {
    console.error('Error en middleware al verificar perfil:', error);
    return redirectToLogin(request);
  }
};

export async function proxy(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request,
  });

  try {
    const supabase = await createServerSupabaseClient();

    let user: User | null = null;
    let authError: unknown = null;

    try {
      const result = await supabase.auth.getUser();
      user = result.data.user;
      authError = result.error;
    } catch (error: unknown) {
      if (getErrorCode(error) !== 'refresh_token_not_found') {
        console.error('Error de autenticacion en middleware:', error);
      }
      authError = error;
    }

    const isAuthenticated = !!(user && !authError);
    const { pathname } = request.nextUrl;

    const tieneParametrosMensaje = request.nextUrl.searchParams.has('timeout') ||
      request.nextUrl.searchParams.has('error') ||
      request.nextUrl.searchParams.has('registro') ||
      request.nextUrl.searchParams.has('verificacion');

    if ((pathname === '/auth/iniciar-sesion' || pathname === '/auth/registrar') && isAuthenticated && user && !tieneParametrosMensaje) {
      try {
        const perfil = await getCurrentProfile(supabase, user.id);

        if (!perfil) {
          return NextResponse.redirect(new URL('/perfil/completar', request.url));
        }

        const estadoUsuario = perfil.estado || 'activo';

        if (isInactiveStatus(estadoUsuario)) {
          return redirectAfterInactiveProfile(supabase, request, estadoUsuario);
        }

        if (!isProfileComplete(perfil)) {
          return NextResponse.redirect(new URL('/perfil/completar', request.url));
        }

        return NextResponse.redirect(dashboardUrlForRole(perfil.rol ?? '', request.url));
      } catch (error) {
        console.error('Error obteniendo perfil en middleware:', error);
        return supabaseResponse;
      }
    }

    if (isCompletarPerfilPath(pathname)) {
      if (!isAuthenticated || !user) {
        return redirectToLogin(request, {
          callbackUrl: requestedPath(request),
          error: 'unauthorized',
        });
      }

      try {
        const perfil = await getCurrentProfile(supabase, user.id);

        if (!perfil) {
          return supabaseResponse;
        }

        const estadoUsuario = perfil.estado || 'activo';

        if (isInactiveStatus(estadoUsuario)) {
          return redirectAfterInactiveProfile(supabase, request, estadoUsuario);
        }

        if (isProfileComplete(perfil)) {
          return NextResponse.redirect(dashboardUrlForRole(perfil.rol ?? '', request.url));
        }

        return supabaseResponse;
      } catch (error) {
        console.error('Error en middleware al verificar perfil completo:', error);
        return redirectToLogin(request);
      }
    }

    if (isAnyRouteMatch(pathname, RUTAS_PUBLICAS)) {
      return supabaseResponse;
    }

    const roleAccess = getRoleAccessForPath(pathname);

    if (
      pathname === '/dashboard' ||
      isAnyRouteMatch(pathname, SHARED_PRIVATE_ROUTES) ||
      roleAccess
    ) {
      return protectPrivateRoute(
        request,
        supabase,
        isAuthenticated ? user : null,
        supabaseResponse,
        roleAccess?.role
      );
    }

    return supabaseResponse;
  } catch (error: unknown) {
    const errorCode = getErrorCode(error);
    if (errorCode !== 'refresh_token_not_found' && errorCode !== 'ECONNRESET') {
      console.error('Error inesperado en middleware:', error);
    }

    const pathname = request.nextUrl.pathname;
    const isProtectedRoute =
      isCompletarPerfilPath(pathname) ||
      pathname === '/dashboard' ||
      isAnyRouteMatch(pathname, SHARED_PRIVATE_ROUTES) ||
      !!getRoleAccessForPath(pathname);

    if (isProtectedRoute) {
      return redirectToLogin(request, {
        callbackUrl: requestedPath(request),
        error: 'unauthorized',
      });
    }

    return supabaseResponse;
  }
}

export const config = {
  matcher: [
    /*
     * Coincide con todas las rutas de solicitud excepto las que comienzan con:
     * - _next/static (archivos estáticos)
     * - _next/image (archivos de optimización de imagen)
     * - favicon.ico (archivo favicon)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
