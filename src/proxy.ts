import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { ROLES_PROTEGIDOS_PAGINA, RUTAS_PUBLICAS, RUTAS_REQUIEREN_SESION } from '@/lib/constantes';

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
  ROLES_PROTEGIDOS_PAGINA.find(({ route }) => isRouteMatch(pathname, route));

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

const forbiddenJson = (message: string) =>
  NextResponse.json({ error: message }, { status: 403 });

const notFoundJson = () =>
  NextResponse.json({ error: 'Recurso no encontrado.' }, { status: 404 });

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

const isApiPath = (pathname: string) => pathname.startsWith('/api/');

const classifyPath = (pathname: string) => {
  if (isAnyRouteMatch(pathname, RUTAS_PUBLICAS)) {
    return 'public' as const;
  }
  if (isApiPath(pathname)) {
    return 'api' as const;
  }
  if (isCompletarPerfilPath(pathname)) {
    return 'completar-perfil' as const;
  }
  if (pathname === '/dashboard') {
    return 'dashboard' as const;
  }
  if (isAnyRouteMatch(pathname, RUTAS_REQUIEREN_SESION)) {
    return 'session-required' as const;
  }
  if (getRoleAccessForPath(pathname)) {
    return 'role-protected' as const;
  }
  return 'unknown' as const;
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
      return forbiddenJson('Acceso denegado por rol.');
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

const protectApiRoute = async (
  request: NextRequest,
  supabase: ServerSupabaseClient,
  user: User | null,
  supabaseResponse: NextResponse
) => {
  if (!user) {
    return forbiddenJson('Se requiere autenticacion.');
  }

  try {
    await getCurrentProfile(supabase, user.id);
    return supabaseResponse;
  } catch (error) {
    console.error('Error en middleware al validar sesion API:', error);
    return forbiddenJson('No fue posible validar la sesion.');
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

    const classification = classifyPath(pathname);

    if (classification === 'public') {
      return supabaseResponse;
    }

    if (classification === 'unknown') {
      return notFoundJson();
    }

    if (classification === 'api') {
      return protectApiRoute(
        request,
        supabase,
        isAuthenticated ? user : null,
        supabaseResponse,
      );
    }

    if (classification === 'dashboard') {
      return protectPrivateRoute(
        request,
        supabase,
        isAuthenticated ? user : null,
        supabaseResponse,
      );
    }

    if (classification === 'session-required') {
      return protectPrivateRoute(
        request,
        supabase,
        isAuthenticated ? user : null,
        supabaseResponse,
      );
    }

    const roleAccess = getRoleAccessForPath(pathname);
    if (classification === 'role-protected' && roleAccess) {
      return protectPrivateRoute(
        request,
        supabase,
        isAuthenticated ? user : null,
        supabaseResponse,
        roleAccess.role,
      );
    }

    return notFoundJson();
  } catch (error: unknown) {
    const errorCode = getErrorCode(error);
    if (errorCode !== 'refresh_token_not_found' && errorCode !== 'ECONNRESET') {
      console.error('Error inesperado en middleware:', error);
    }

    const pathname = request.nextUrl.pathname;
    const classification = classifyPath(pathname);

    if (classification === 'unknown') {
      return notFoundJson();
    }

    if (classification === 'api') {
      return forbiddenJson('No fue posible validar la sesion.');
    }

    return redirectToLogin(request, {
      callbackUrl: requestedPath(request),
      error: 'unauthorized',
    });
  }
}

export const config = {
  matcher: [
    /*
     * Coincide con todas las rutas de solicitud excepto las que comienzan con:
     * - _next/static (archivos estaticos)
     * - _next/image (archivos de optimizacion de imagen)
     * - favicon.ico (archivo favicon)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};