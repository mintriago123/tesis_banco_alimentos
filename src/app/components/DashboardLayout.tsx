'use client';

import { useEffect, useState, createContext, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Sidebar from '@/app/components/Sidebar';
import { Bars3Icon } from '@heroicons/react/24/outline';
import { LoadingState } from '@/app/components/ui/LoadingState';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { accentForRole } from '@/app/components/ui/theme';

interface DashboardLayoutProps {
  readonly children: React.ReactNode;
  readonly requiredRole?: 'ADMINISTRADOR' | 'OPERADOR' | 'DONANTE' | 'SOLICITANTE' | 'ANY';
  readonly title?: string;
  readonly description?: string;
}

// Note: ConfirmProvider lives in the root layout (src/app/layout.tsx), not
// here — pages call useConfirm() in their own top-level function body, which
// is a tree ancestor of whatever this component renders, so a provider
// nested inside DashboardLayout's returned JSX can never reach them.

const SidebarContext = createContext<{
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}>({
  isCollapsed: false,
  setIsCollapsed: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export default function DashboardLayout({ children, requiredRole = 'ANY', title = 'Dashboard', description }: DashboardLayoutProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const authLoading = status === 'loading';
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setIsCollapsed(window.innerWidth < 768);
  }, []);

  const sidebarContextValue = useMemo(() => ({ isCollapsed, setIsCollapsed }), [isCollapsed]);

  const getRedirectUrl = (userRole: string) => {
    switch (userRole) {
      case 'ADMINISTRADOR':
        return '/admin/dashboard';
      case 'OPERADOR':
        return '/operador/dashboard';
      case 'DONANTE':
        return '/donante/dashboard';
      default:
        return '/user/dashboard';
    }
  };

  const checkRoleAccess = (userRole: string, required: string) => (required === 'ANY' ? true : userRole === required);

  useEffect(() => {
    if (authLoading) return;

    if (!session?.user) {
      window.location.href = '/auth/iniciar-sesion';
      return;
    }

    const { rol, nombre, cedula, ruc } = session.user;

    if (!rol) {
      window.location.href = '/auth/iniciar-sesion';
      return;
    }

    const profileComplete = hasText(rol) && hasText(nombre) && (hasText(cedula) || hasText(ruc));
    if (!profileComplete) {
      router.replace('/perfil/completar');
      return;
    }

    if (!checkRoleAccess(rol, requiredRole)) {
      router.push(getRedirectUrl(rol));
    }
  }, [session, router, requiredRole, authLoading]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <LoadingState />
      </div>
    );
  }

  if (!session?.user?.rol) {
    return null;
  }

  const { rol, nombre } = session.user;

  return (
    <SidebarContext.Provider value={sidebarContextValue}>
      <div className="min-h-screen bg-slate-50" data-role={accentForRole(rol)}>
        <Sidebar userRole={rol} userName={nombre} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

        <div className={`min-h-screen transition-all duration-300 ${isCollapsed ? 'ml-0 md:ml-16' : 'ml-0 md:ml-64'}`}>
          {(title || description) && (
            <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4 sm:py-4 lg:px-6">
              <div className="mx-auto flex max-w-7xl items-center gap-3">
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  type="button"
                  className="flex-shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
                  aria-label={isCollapsed ? 'Abrir menú lateral' : 'Cerrar menú lateral'}
                  aria-expanded={!isCollapsed}
                >
                  <Bars3Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>

                <div className="min-w-0 flex-1">
                  <PageHeader title={title} description={description} />
                </div>
              </div>
            </header>
          )}

          <main id="main-content" className="p-3 sm:p-4 md:p-5 lg:p-6">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
