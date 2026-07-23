'use client';

import { useEffect, useState, createContext, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/app/components/SupabaseProvider';
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

interface UserProfile {
  rol: string;
  nombre: string | null;
  cedula?: string | null;
  ruc?: string | null;
}

// Context para manejar el estado del sidebar
const SidebarContext = createContext<{
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}>({
  isCollapsed: false,
  setIsCollapsed: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isProfileComplete = (profile: UserProfile) =>
  hasText(profile.rol) &&
  hasText(profile.nombre) &&
  (hasText(profile.cedula) || hasText(profile.ruc));

export default function DashboardLayout({ 
  children, 
  requiredRole = 'ANY',
  title = 'Dashboard',
  description 
}: DashboardLayoutProps) {
  const router = useRouter();
  const { supabase, user, isLoading: authLoading } = useSupabase();
  const [perfil, setPerfil] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setIsCollapsed(window.innerWidth < 768);
  }, []);

  const sidebarContextValue = useMemo(() => ({
    isCollapsed,
    setIsCollapsed
  }), [isCollapsed, setIsCollapsed]);

  const getRedirectUrl = (userRole: string) => {
    switch (userRole) {
      case 'ADMINISTRADOR': return '/admin/dashboard';
      case 'OPERADOR': return '/operador/dashboard';
      case 'DONANTE': return '/donante/dashboard';
      default: return '/user/dashboard';
    }
  };

  const checkRoleAccess = (userRole: string, requiredRole: string) => {
    if (requiredRole === 'ANY') return true;
    return userRole === requiredRole;
  };

  useEffect(() => {
    if (authLoading) {
      return; // Esperar a que termine la carga de autenticación
    }

    if (!user) {
      // No hay usuario, redirigir a login
      window.location.href = '/auth/iniciar-sesion';
      return;
    }

    const loadUserProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('usuarios')
          .select('rol, nombre, cedula, ruc')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error cargando perfil:', error);
          // Si hay error al cargar el perfil, cerrar sesión y redirigir
          await supabase.auth.signOut();
          window.location.href = '/auth/iniciar-sesion';
          return;
        }

        const profile: UserProfile = {
          rol: data.rol,
          nombre: data.nombre ?? null,
          cedula: data.cedula ?? null,
          ruc: data.ruc ?? null,
        };

        if (!isProfileComplete(profile)) {
          router.replace('/perfil/completar');
          return;
        }

        // Verificar acceso según rol
        if (!checkRoleAccess(profile.rol, requiredRole)) {
          router.push(getRedirectUrl(profile.rol));
          return;
        }

        setPerfil(profile);
      } catch (error) {
        console.error('Error:', error);
        await supabase.auth.signOut();
        window.location.href = '/auth/iniciar-sesion';
      } finally {
        setLoading(false);
      }
    };

    loadUserProfile();
  }, [user, router, supabase, requiredRole, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50"><LoadingState /></div>
    );
  }

  if (!user || !perfil) {
    return null;
  }

  return (
    <SidebarContext.Provider value={sidebarContextValue}>
      <div className="min-h-screen bg-slate-50" data-role={accentForRole(perfil.rol)}>
        {/* Sidebar fijo */}
        <Sidebar 
          userRole={perfil.rol} 
          userName={perfil.nombre}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
        />
        
        {/* Contenido principal con margen dinámico */}
        <div className={`min-h-screen transition-all duration-300 ${isCollapsed ? 'ml-0 md:ml-16' : 'ml-0 md:ml-64'}`}>
          {/* Header opcional */}
          {(title || description) && (
            <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4 sm:py-4 lg:px-6">
              <div className="mx-auto flex max-w-7xl items-center gap-3">
                {/* Botón para mostrar sidebar en móvil */}
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  type="button"
                  className="flex-shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
                  aria-label={isCollapsed ? 'Abrir menú lateral' : 'Cerrar menú lateral'}
                  aria-expanded={!isCollapsed}
                >
                  <Bars3Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
                
                <div className="min-w-0 flex-1"><PageHeader title={title} description={description} /></div>
              </div>
            </header>
          )}
          
          {/* Contenido */}
          <main id="main-content" className="p-3 sm:p-4 md:p-5 lg:p-6">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
