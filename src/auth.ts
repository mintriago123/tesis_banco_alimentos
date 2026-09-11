import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { dbAdmin } from '@/db/client';
import { users, usuarios } from '@/db/schema';
import { validarEstadoUsuario } from '@/modules/auth/validar-estado';
import type { Rol } from '@/modules/auth/types';

// Auth.js deliberately only forwards a short `code` to the client for a
// failed credentials sign-in (never the thrown error's full message — see
// CredentialsSignin's own doc comment in @auth/core), so a blocked/deactivated
// account can't leak the exact reason via a query param. `useLogin` maps these
// codes back to the same category-level Spanish messages the old app showed.
class CuentaBloqueadaError extends CredentialsSignin {
  code = 'account-blocked';
}
class CuentaDesactivadaError extends CredentialsSignin {
  code = 'account-deactivated';
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      rol: Rol | null;
      estado: string | null;
      nombre: string | null;
      cedula: string | null;
      ruc: string | null;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // No adapter: Auth.js's Credentials provider only supports the JWT session
  // strategy (a database strategy throws `UnsupportedStrategy` at runtime —
  // confirmed the hard way against a live login attempt, not from docs alone).
  // `authorize()` below reads/verifies against our own `users`/`usuarios`
  // tables directly via Drizzle, so no adapter-managed account/session
  // tables are needed at all.
  session: { strategy: 'jwt' },
  // Without this, Auth.js rejects any request whose Host header doesn't
  // exactly match what it expects (`UntrustedHost`) — found by actually
  // running the app (localhost vs 127.0.0.1 in a Playwright run), not by
  // tsc/build. This app is meant to run self-hosted, typically behind a
  // reverse proxy whose forwarded Host varies, so trusting it here (rather
  // than hardcoding one origin) is the correct call, not just a test fix.
  trustHost: true,
  pages: {
    signIn: '/auth/iniciar-sesion',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Correo electrónico', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : null;
        const password = typeof credentials?.password === 'string' ? credentials.password : null;
        if (!email || !password) return null;

        const [user] = await dbAdmin.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user) return null;

        const passwordValida = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValida) return null;

        const [perfil] = await dbAdmin.select().from(usuarios).where(eq(usuarios.id, user.id)).limit(1);
        if (perfil) {
          const estado = validarEstadoUsuario({
            estado: perfil.estado,
            fechaFinBloqueo: perfil.fechaFinBloqueo,
            motivoBloqueo: perfil.motivoBloqueo,
          });
          if (!estado.ok) {
            throw perfil.estado === 'desactivado' ? new CuentaDesactivadaError() : new CuentaBloqueadaError();
          }
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    // Stamps the user id onto the token once, right after authorize()
    // succeeds (this is the only point `user` is available under JWT
    // strategy — every later call only gets the previously-issued token).
    jwt: async ({ token, user }) => {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    // Re-read rol/estado from the database on every call rather than baking
    // them into the JWT at sign-in time, so a role/estado change (e.g. an
    // admin blocking this user) takes effect on the next request the user
    // makes — not just next login. The JWT itself only carries a stable id.
    session: async ({ session, token }) => {
      const userId = token.sub;
      if (!userId) {
        return session;
      }

      const [perfil] = await dbAdmin.select().from(usuarios).where(eq(usuarios.id, userId)).limit(1);
      session.user.id = userId;
      session.user.rol = (perfil?.rol as Rol | undefined) ?? null;
      session.user.estado = perfil?.estado ?? null;
      session.user.nombre = perfil?.nombre ?? null;
      session.user.cedula = perfil?.cedula ?? null;
      session.user.ruc = perfil?.ruc ?? null;
      return session;
    },
  },
});
