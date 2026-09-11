'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/app/components/DashboardLayout';
import { LoadingSpinner } from '@/app/components';
import { useNotificaciones } from '@/modules/shared/hooks/useNotificaciones';
import {
  NotificacionCard,
  EstadisticasNotificaciones,
  FiltrosNotificaciones,
  AccionesNotificaciones,
  EmptyStateNotificaciones,
} from '@/modules/shared/components/notificaciones';
import { safeInternalPath } from '@/lib/safe-internal-path';

export default function NotificacionesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { notificaciones, loading, conteoNoLeidas, marcarComoLeida, marcarTodasComoLeidas, eliminarNotificacion } = useNotificaciones(
    session?.user?.id ?? null,
  );

  const [filtros, setFiltros] = useState({ tipo: 'todos', categoria: 'todas', estado: 'todas' });
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);

  const notificacionesFiltradas = notificaciones.filter((notificacion) => {
    const coincideTipo = filtros.tipo === 'todos' || notificacion.tipo === filtros.tipo;
    const coincideCategoria = filtros.categoria === 'todas' || notificacion.categoria === filtros.categoria;
    const coincideEstado =
      filtros.estado === 'todas' || (filtros.estado === 'leidas' && notificacion.leida) || (filtros.estado === 'no_leidas' && !notificacion.leida);

    return coincideTipo && coincideCategoria && coincideEstado;
  });

  const handleNotificacionClick = async (notificacion: { id: string; leida: boolean; url_accion?: string }) => {
    if (!notificacion.leida) {
      await marcarComoLeida(notificacion.id);
    }

    const urlAccion = safeInternalPath(notificacion.url_accion);
    if (urlAccion) {
      router.push(urlAccion);
    }
  };

  const handleSeleccionarNotificacion = (id: string) => {
    setSeleccionadas((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleSeleccionarTodas = () => {
    setSeleccionadas(seleccionadas.length === notificacionesFiltradas.length ? [] : notificacionesFiltradas.map((n) => n.id));
  };

  const handleMarcarSeleccionadasComoLeidas = async () => {
    const promesas = seleccionadas
      .filter((id) => {
        const notificacion = notificaciones.find((n) => n.id === id);
        return notificacion && !notificacion.leida;
      })
      .map((id) => marcarComoLeida(id));

    await Promise.all(promesas);
    setSeleccionadas([]);
  };

  const handleEliminarSeleccionadas = async () => {
    const promesas = seleccionadas.map((id) => eliminarNotificacion(id));
    await Promise.all(promesas);
    setSeleccionadas([]);
  };

  return (
    <DashboardLayout title="Notificaciones" description="Gestiona todas tus notificaciones">
      <div className="space-y-6">
        <EstadisticasNotificaciones total={notificaciones.length} noLeidas={conteoNoLeidas} leidas={notificaciones.length - conteoNoLeidas} />

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <FiltrosNotificaciones filtros={filtros} onFiltrosChange={setFiltros} />

            <AccionesNotificaciones
              conteoNoLeidas={conteoNoLeidas}
              seleccionadas={seleccionadas.length}
              onMarcarTodasLeidas={marcarTodasComoLeidas}
              onMarcarSeleccionadasLeidas={handleMarcarSeleccionadasComoLeidas}
              onEliminarSeleccionadas={handleEliminarSeleccionadas}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading ? (
            <LoadingSpinner mensaje="Cargando notificaciones..." />
          ) : notificacionesFiltradas.length === 0 ? (
            <EmptyStateNotificaciones hayNotificaciones={notificaciones.length > 0} />
          ) : (
            <div>
              <div className="flex items-center px-6 py-3 border-b border-gray-200 bg-gray-50">
                <input
                  type="checkbox"
                  checked={seleccionadas.length === notificacionesFiltradas.length && notificacionesFiltradas.length > 0}
                  onChange={handleSeleccionarTodas}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">
                  {seleccionadas.length > 0 ? `${seleccionadas.length} seleccionadas` : `${notificacionesFiltradas.length} notificaciones`}
                </span>
              </div>

              <div className="divide-y divide-gray-200">
                {notificacionesFiltradas.map((notificacion) => (
                  <NotificacionCard
                    key={notificacion.id}
                    notificacion={notificacion}
                    seleccionada={seleccionadas.includes(notificacion.id)}
                    onSeleccionar={handleSeleccionarNotificacion}
                    onClick={handleNotificacionClick}
                    onMarcarLeida={marcarComoLeida}
                    onEliminar={eliminarNotificacion}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
