import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import type { Rol } from '@/modules/auth/types';

// Next.js 16 renamed `middleware.ts` -> `proxy.ts` (same mechanism, Node.js
// runtime by default now — see node_modules/next/dist/docs/.../proxy.md).
// This replaces the old app's session-refresh-only client-side auth guard
// with a real server-side gate before role-bound routes render.

const ROLE_PREFIXES: Array<{ prefix: string; rol: Rol }> = [
  { prefix: '/admin', rol: 'ADMINISTRADOR' },
  { prefix: '/donante', rol: 'DONANTE' },
  { prefix: '/operador', rol: 'OPERADOR' },
  { prefix: '/user', rol: 'SOLICITANTE' },
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const match = ROLE_PREFIXES.find(({ prefix }) => pathname.startsWith(prefix));
  if (!match) return NextResponse.next();

  const session = req.auth;
  if (!session?.user) {
    const url = new URL('/auth/iniciar-sesion', req.nextUrl.origin);
    url.searchParams.set('error', 'unauthorized');
    return NextResponse.redirect(url);
  }

  if (session.user.rol !== match.rol) {
    const url = new URL('/auth/iniciar-sesion', req.nextUrl.origin);
    url.searchParams.set('error', 'forbidden');
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/admin/:path*', '/donante/:path*', '/operador/:path*', '/user/:path*'],
};
