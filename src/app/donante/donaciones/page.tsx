'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/app/components/DashboardLayout';
import { Alert } from '@/app/components/ui/Alert';
import { LoadingState } from '@/app/components/ui/LoadingState';
import { useModal, useDonationStats, useFilter, useDonacionesData } from '@/modules/donante/donaciones/hooks';
import type { MotivoCancelacion } from '@/modules/shared/donaciones';
import {
  DonacionesHeader,
  DonacionesStats,
  DonacionesFilters,
  DonacionesTable,
  DonacionDetalleModal,
  DonacionEdicionModal,
  DonacionCancelacionModal,
  DonacionesEmptyState,
} from '@/modules/donante/donaciones/components';
import type { Donacion } from '@/modules/donante/donaciones/types';

export default function MisDonacionesPage() {
  const { data: session } = useSession();
  const user = session?.user ? { id: session.user.id } : null;

  const { donaciones, cargando, mensaje, cancelandoId, cargarDonaciones, cancelarDonacion, actualizarDonacion: actualizar } = useDonacionesData(user);

  const modalEdicion = useModal<Donacion>();
  const modalDetalle = useModal<Donacion>();
  const modalCancelacion = useModal<Donacion>();

  const { filtro: filtroEstado, setFiltro: setFiltroEstado, datosFiltrados: donacionesFiltradas } = useFilter<Donacion>(
    donaciones,
    (donacion, filtro) => donacion.estado === filtro,
    'todos',
  );

  const estadisticas = useDonationStats(donaciones);

  useEffect(() => {
    if (user) cargarDonaciones();
  }, [user, cargarDonaciones]);

  const handleActualizarDonacion = async () => {
    if (!modalEdicion.data) return;

    if (!modalEdicion.data.cantidad || modalEdicion.data.cantidad <= 0) {
      alert('La cantidad debe ser mayor a 0');
      return;
    }

    const exito = await actualizar(modalEdicion.data);
    if (exito) {
      modalEdicion.close();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (modalEdicion.data) {
      if (name === 'cantidad') {
        const cantidad = value === '' ? 0 : parseFloat(value);
        modalEdicion.setData({ ...modalEdicion.data, cantidad: isNaN(cantidad) ? 0 : cantidad });
      } else {
        modalEdicion.setData({ ...modalEdicion.data, [name]: value });
      }
    }
  };

  const handleConfirmarCancelacion = async (motivo: MotivoCancelacion, observaciones?: string) => {
    if (!modalCancelacion.data) return;

    const donacionCancelada = await cancelarDonacion(modalCancelacion.data.id, motivo, observaciones);

    if (!donacionCancelada) {
      throw new Error('No se pudo cancelar la donación. Verifica que aún esté pendiente.');
    }
  };

  return (
    <DashboardLayout requiredRole="DONANTE" title="Mis donaciones" description="Consulta el estado y el historial de tus aportes al Banco de Alimentos.">
      <div className="space-y-6">
        <DonacionesHeader totalDonaciones={estadisticas.total} />

        {mensaje && <Alert tipo="info" mensaje={mensaje} />}

        <DonacionesStats stats={estadisticas} />

        <DonacionesFilters
          filtroEstado={filtroEstado}
          onFiltroChange={setFiltroEstado}
          totalDonaciones={donaciones.length}
          donacionesFiltradas={donacionesFiltradas.length}
        />

        {modalEdicion.isOpen && modalEdicion.data && (
          <DonacionEdicionModal donacion={modalEdicion.data} isOpen={modalEdicion.isOpen} onClose={modalEdicion.close} onSave={handleActualizarDonacion} onChange={handleChange} />
        )}

        {modalDetalle.isOpen && modalDetalle.data && <DonacionDetalleModal donacion={modalDetalle.data} isOpen={modalDetalle.isOpen} onClose={modalDetalle.close} />}

        <DonacionCancelacionModal
          donacion={modalCancelacion.data}
          isOpen={modalCancelacion.isOpen}
          isProcessing={cancelandoId === modalCancelacion.data?.id}
          onClose={modalCancelacion.close}
          onConfirm={handleConfirmarCancelacion}
        />

        {cargando ? (
          <LoadingState message="Cargando donaciones…" />
        ) : donacionesFiltradas.length === 0 ? (
          <DonacionesEmptyState filtroEstado={filtroEstado} />
        ) : (
          <DonacionesTable donaciones={donacionesFiltradas} onVerDetalle={modalDetalle.open} onEditar={modalEdicion.open} onCancelar={modalCancelacion.open} />
        )}
      </div>
    </DashboardLayout>
  );
}
