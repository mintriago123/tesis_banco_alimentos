'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSupabase } from '@/app/components/SupabaseProvider';
import NotificacionesDropdown from '@/app/components/NotificacionesDropdown';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon,
  HomeIcon,
  UserGroupIcon,
  ChartBarIcon,
  UserIcon,
  ClipboardDocumentListIcon,
  PlusCircleIcon,
  Cog6ToothIcon,
  BuildingStorefrontIcon,
  PowerIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  QrCodeIcon
} from '@heroicons/react/24/outline';
import { accentForRole, roleThemes } from '@/app/components/ui/theme';

interface SidebarProps {
  readonly userRole?: string;
  readonly userName?: string | null;
  readonly isCollapsed?: boolean;
  readonly setIsCollapsed?: (collapsed: boolean) => void;
}

interface MenuItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  adminOnly?: boolean;
  operadorOnly?: boolean;
  donanteOnly?: boolean;
  solicitanteOnly?: boolean;
  subItems?: SubMenuItem[];
}

interface SubMenuItem {
  name: string;
  href: string;
  description?: string;
}

const menuItems: MenuItem[] = [
  // Items para Administradores
  {
    name: 'Dashboard Admin',
    href: '/admin/dashboard',
    icon: HomeIcon,
    description: 'Panel principal de administración',
    adminOnly: true
  },
  {
    name: 'Usuarios',
    href: '/admin/usuarios',
    icon: UserGroupIcon,
    description: 'Gestionar usuarios del sistema',
    adminOnly: true
  },
  {
    name: 'Catálogo de Alimentos', 
    href: '/admin/catalogo',
    icon: ClipboardDocumentListIcon,
    description: 'Ver y gestionar el catálogo de alimentos',
    adminOnly: true
  },
  {
    name: 'Reportes',
    href: '/admin/reportes',
    icon: ChartBarIcon,
    description: 'Estadísticas y análisis',
    adminOnly: true,
    subItems: [
      // },
      {
        name: 'Inventario',
        href: '/admin/reportes/inventario',
        description: 'Estado actual del inventario'
      },
      {
        name: 'Movimientos',
        href: '/admin/reportes/movimientos',
        description: 'Historial de entradas y salidas'
      },
      {
        name: 'Bajas',
        href: '/admin/reportes/bajas',
        description: 'Registro de productos dados de baja'
      },
      {
        name: 'Solicitudes',
        href: '/admin/reportes/solicitudes',
        description: 'Análisis de solicitudes recibidas'
      }, 
     {
        name: 'Donaciones',
        href: '/admin/reportes/donaciones',
        description: 'Análisis de donaciones recibidas'
      }, 
      {
        name: 'Cancelaciones',
        href: '/admin/reportes/cancelaciones-donaciones',
        description: 'Historial de donaciones canceladas'
      }, 
      {
        name: 'Solicitudes de bodegas',
        href: '/admin/reportes/solicitudes-bodegas',
        description: 'Revisar altas y modificaciones de bodegas'
      },
      // {
      //   name: 'Historial de Reportes',
      //   href: '/admin/reportes/historial',
      //   description: 'Reportes generados anteriormente'
      // }
    ]
  },
  
  // Items para Operadores
  {
    name: 'Dashboard Operador',
    href: '/operador/dashboard',
    icon: HomeIcon,
    description: 'Panel principal de operador',
    operadorOnly: true
  },
  {
    name: 'Gestionar Solicitudes',
    href: '/operador/solicitudes',
    icon: ClipboardDocumentListIcon,
    description: 'Aprobar/Rechazar solicitudes',
    operadorOnly: true
  },
  {
    name: 'Solicitudes de bodegas',
    href: '/operador/solicitudes-bodegas',
    icon: BuildingStorefrontIcon,
    description: 'Revisar bodegas de donantes',
    operadorOnly: true
  },
  {
    name: 'Gestionar Donaciones',
    href: '/operador/donaciones',
    icon: PlusCircleIcon,
    description: 'Actualizar estados de donaciones',
    operadorOnly: true
  },
  {
    name: 'Ajustar Inventario',
    href: '/operador/inventario',
    icon: ChartBarIcon,
    description: 'Control de stock disponible',
    operadorOnly: true
  },
  {
    name: 'Validar Comprobante',
    href: '/operador/validar-comprobante',
    icon: QrCodeIcon,
    description: 'Buscar por código de comprobante',
    operadorOnly: true
  },
  
  // Items para Donantes
  {
    name: 'Dashboard',
    href: '/donante/dashboard',
    icon: HomeIcon,
    description: 'Panel principal',
    donanteOnly: true
  },
  {
    name: 'Mis Donaciones',
    href: '/donante/donaciones',
    icon: ClipboardDocumentListIcon,
    description: 'Ver mis donaciones realizadas',
    donanteOnly: true
  },
  {
    name: 'Mis Bodegas',
    href: '/donante/configuracion/bodegas',
    icon: BuildingStorefrontIcon,
    description: 'Gestionar bodegas de origen',
    donanteOnly: true
  },
  {
    name: 'Nueva Donación',
    href: '/donante/nueva-donacion',
    icon: PlusCircleIcon,
    description: 'Registrar nueva donación',
    donanteOnly: true
  },
  {
    name: 'Solicitar Alimento',
    href: '/donante/solicitar-alimento',
    icon: ClipboardDocumentListIcon,
    description: 'Proponer un alimento para el catálogo',
    donanteOnly: true
  },
  // {
  //   name: 'Solicitudes Activas',
  //   href: '/donante/solicitudes',
  //   icon: DocumentTextIcon,
  //   description: 'Ver solicitudes de ayuda',
  //   donanteOnly: true
  // },
  
  // Items para Solicitantes
  {
    name: 'Inicio',
    href: '/user/dashboard',
    icon: HomeIcon,
    description: 'Panel principal',
    solicitanteOnly: true
  },
  {
    name: 'Mis Solicitudes',
    href: '/user/solicitudes',
    icon: ClipboardDocumentListIcon,
    description: 'Ver mis solicitudes',
    solicitanteOnly: true
  },
  {
    name: 'Nueva Solicitud',
    href: '/user/formulario',
    icon: PlusCircleIcon,
    description: 'Crear nueva solicitud',
    solicitanteOnly: true
  },
  // {
  //   name: 'Configuración',
  //   href: '/user/configuracion',
  //   icon: Cog6ToothIcon,
  //   description: 'Ajustes de la cuenta',
  //   solicitanteOnly: true
  // }
];

export default function Sidebar({ 
  userRole = 'SOLICITANTE', 
  userName,
  isCollapsed: externalIsCollapsed,
  setIsCollapsed: externalSetIsCollapsed
}: SidebarProps) {
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [openSubMenus, setOpenSubMenus] = useState<string[]>([]);
  const pathname = usePathname();
  const { supabase } = useSupabase();

  // Usar el estado externo si está disponible, sino usar el interno
  const isCollapsed = externalIsCollapsed ?? internalIsCollapsed;
  const setIsCollapsed = externalSetIsCollapsed || setInternalIsCollapsed;

  const isAdmin = userRole === 'ADMINISTRADOR';
  const isOperador = userRole === 'OPERADOR';
  const isDonante = userRole === 'DONANTE';
  const isSolicitante = userRole === 'SOLICITANTE';
  const roleTheme = roleThemes[accentForRole(userRole)];

  // Filtrar items según el rol
  const filteredMenuItems = menuItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.operadorOnly && !isOperador) return false;
    if (item.donanteOnly && !isDonante) return false;
    if (item.solicitanteOnly && !isSolicitante) return false;
    return true;
  });

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      // 1. Primero cerrar sesión en el cliente
      await supabase.auth.signOut();
      
      // 2. Luego llamar a la API para limpiar cookies del servidor
      await fetch('/api/auth/signout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }).catch(() => {
        // Suprimir errores de fetch durante logout
      });
      
      // 3. Forzar recarga completa para limpiar todo el estado
      window.location.href = '/auth/iniciar-sesion';
    } catch (error) {
      // Solo loggear si no es un error esperado
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code !== 'ECONNRESET') {
          console.error('Error al cerrar sesión:', error);
        }
      }
      // Incluso si hay error, redirigir
      window.location.href = '/auth/iniciar-sesion';
    }
  };

  const isActiveRoute = (href: string) => {
    if (href === '/user/dashboard' && pathname === '/user/dashboard') return true;
    if (href === '/admin/dashboard' && pathname === '/admin/dashboard') return true;
    if (href === '/operador/dashboard' && pathname === '/operador/dashboard') return true;
    if (href === '/donante/dashboard' && pathname === '/donante/dashboard') return true;
    return pathname.startsWith(href) && 
           href !== '/user/dashboard' && 
           href !== '/admin/dashboard' && 
           href !== '/operador/dashboard' && 
           href !== '/donante/dashboard';
  };

  const toggleSubMenu = (itemName: string) => {
    setOpenSubMenus(prev => 
      prev.includes(itemName) 
        ? prev.filter(name => name !== itemName)
        : [...prev, itemName]
    );
  };

  const isSubMenuOpen = (itemName: string) => {
    return openSubMenus.includes(itemName);
  };

  const hasActiveSubItem = (subItems?: SubMenuItem[]) => {
    if (!subItems) return false;
    return subItems.some(subItem => isActiveRoute(subItem.href));
  };

  const getActiveStyles = (isActive: boolean) => {
    return isActive
      ? `${roleTheme.soft} shadow-sm`
      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950';
  };

  const getIconStyles = (isActive: boolean) => {
    return isActive ? roleTheme.text : 'text-slate-500 group-hover:text-slate-700';
  };

  const getRoleLabel = () => {
    if (isAdmin) return 'Panel administrador';
    if (isOperador) return 'Panel operador';
    if (isDonante) return 'Panel donante';
    return 'Panel solicitante';
  };

  const getAvatarColor = () => {
    return roleTheme.primary;
  };

  const displayUserName = typeof userName === 'string' && userName.trim()
    ? userName.trim()
    : 'Usuario';

  const getUserInitials = (name: string | null | undefined) => {
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    if (!normalizedName) {
      return 'US';
    }

    return normalizedName
      .split(' ')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };

  const profileHref = isAdmin ? '/admin/perfil' : isOperador ? '/operador/perfil' : isDonante ? '/donante/perfil' : '/user/perfil';
  const settingsHref = isAdmin ? '/admin/configuracion' : isOperador ? '/operador/configuracion' : isDonante ? '/donante/configuracion' : '/user/configuracion';
  const closeOnMobile = () => {
    if (window.innerWidth < 768) setIsCollapsed(true);
  };

  return (
    <>
      {/* Overlay transparente para cerrar el sidebar al hacer clic fuera en móvil */}
      {!isCollapsed && (
        <button
          type="button"
          className="fixed inset-0 z-30 md:hidden"
          onClick={() => setIsCollapsed(true)}
          aria-label="Cerrar sidebar"
        />
      )}
      
      <div className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r border-slate-200 bg-white shadow-lg transition-all duration-300 ${
        isCollapsed ? '-translate-x-full md:translate-x-0 md:w-16' : 'translate-x-0 w-64'
      }`}>
      {/* Header del Sidebar con Avatar */}
      <div className="border-b border-slate-100 bg-white p-3 sm:p-4">
        {!isCollapsed ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
                {/* Avatar con iniciales */}
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm sm:h-10 sm:w-10 sm:text-sm ${getAvatarColor()}`}>
                  {getUserInitials(displayUserName)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="truncate text-xs font-semibold text-slate-900 sm:text-sm">
                    {displayUserName}
                  </h2>
                  <p className={`text-xs font-semibold ${roleTheme.text}`}>
                    {getRoleLabel()}
                  </p>
                </div>
              </div>
              
              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="flex-shrink-0 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                aria-label="Contraer sidebar"
              >
                <ChevronLeftIcon className="h-4 w-4 text-slate-600" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-2">
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shadow-sm ${getAvatarColor()}`}
              title={`Expandir sidebar - ${displayUserName}`}
            >
              {getUserInitials(displayUserName)}
            </button>
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="rounded-lg p-1 text-slate-600 hover:bg-slate-100"
              aria-label="Expandir sidebar"
            >
              <ChevronRightIcon className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        )}
        
        {/* Menú de perfil expandible cuando no está colapsado */}
        {!isCollapsed && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-2 text-left hover:bg-slate-50"
              aria-expanded={isProfileMenuOpen}
            >
              <span className="text-xs font-semibold text-slate-600">Opciones de cuenta</span>
              {isProfileMenuOpen ? (
                <ChevronUpIcon className="h-3 w-3 text-slate-500" />
              ) : (
                <ChevronDownIcon className="h-3 w-3 text-slate-500" />
              )}
            </button>
            
            {isProfileMenuOpen && (
              <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2">
                <Link href={profileHref} onClick={closeOnMobile} className="flex w-full items-center rounded-lg px-3 py-2 text-left hover:bg-white hover:shadow-sm">
                  <UserIcon className="mr-2 h-4 w-4 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-700">Mi Perfil</span>
                </Link>
                <Link href={settingsHref} onClick={closeOnMobile} className="flex w-full items-center rounded-lg px-3 py-2 text-left hover:bg-white hover:shadow-sm">
                  <Cog6ToothIcon className="mr-2 h-4 w-4 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-700">Configuración</span>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sección de Notificaciones */}
      <div className="border-b border-slate-100 bg-white px-4 py-2">
        <NotificacionesDropdown isCollapsed={isCollapsed} roleColor={
          isAdmin ? 'red' : isOperador ? 'orange' : isDonante ? 'green' : 'blue'
        } />
      </div>

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto p-2" aria-label="Navegación principal">
        <ul className="space-y-1">
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = isActiveRoute(item.href);
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isSubMenuOpenState = isSubMenuOpen(item.name);
            const hasActiveSubItemState = hasActiveSubItem(item.subItems);
            const isItemActive = isActive || hasActiveSubItemState;
            const itemClassName = `group flex w-full items-center rounded-xl px-2 py-2 text-left sm:px-3 sm:py-2.5 ${getActiveStyles(isItemActive)}`;
            const itemContent = (
              <>
                <Icon className={`h-5 w-5 flex-shrink-0 ${isCollapsed ? 'mx-auto' : 'mr-2 sm:mr-3'} ${getIconStyles(isItemActive)}`} />
                {!isCollapsed && (
                  <>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold sm:text-sm">{item.name}</span>
                      {item.description && <p className="mt-0.5 hidden truncate text-xs text-slate-500 sm:block">{item.description}</p>}
                    </div>
                    {hasSubItems && (isSubMenuOpenState ? <ChevronUpIcon className="ml-2 h-4 w-4 text-slate-500" /> : <ChevronDownIcon className="ml-2 h-4 w-4 text-slate-500" />)}
                  </>
                )}
              </>
            );
            
            return (
              <li key={item.name}>
                {/* Item principal */}
                <div className="relative">
                  {hasSubItems && !isCollapsed ? (
                    <button
                      type="button"
                      onClick={() => toggleSubMenu(item.name)}
                      className={itemClassName}
                      aria-expanded={isSubMenuOpenState}
                    >
                      {itemContent}
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={closeOnMobile}
                      className={itemClassName}
                      title={isCollapsed ? item.name : undefined}
                      aria-current={isItemActive ? 'page' : undefined}
                    >
                      {itemContent}
                    </Link>
                  )}

                  {/* Submenú */}
                  {hasSubItems && !isCollapsed && isSubMenuOpenState && (
                    <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-200 pl-2 sm:ml-8 sm:pl-3">
                      {item.subItems!.map((subItem) => {
                        const isSubActive = isActiveRoute(subItem.href);
                        
                        return (
                          <Link
                            key={subItem.name}
                            href={subItem.href}
                            onClick={closeOnMobile}
                            className={`group flex w-full items-start rounded-lg px-2 py-2 text-left ${isSubActive ? `${roleTheme.soft} shadow-sm` : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
                            aria-current={isSubActive ? 'page' : undefined}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-semibold sm:text-sm">{subItem.name}</span>
                              {subItem.description && <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">{subItem.description}</p>}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer con logout moderno */}
      <div className="border-t border-slate-100 bg-slate-50 p-3">
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className={`flex w-full items-center rounded-xl border border-transparent px-3 py-2.5 text-left text-slate-600 hover:border-rose-200 hover:bg-white hover:text-rose-700 hover:shadow-sm disabled:opacity-50 ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'Cerrar sesión' : undefined}
        >
          <PowerIcon aria-hidden="true" className={`h-4 w-4 ${isCollapsed ? '' : 'mr-3'}`} />
          {!isCollapsed && (
            <span className="text-sm font-medium">
              {isLoggingOut ? 'Cerrando...' : 'Cerrar Sesión'}
            </span>
          )}
        </button>
      </div>
      </div>
    </>
  );
}
