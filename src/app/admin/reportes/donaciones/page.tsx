'use client';

import { useCallback, useMemo, useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import Toast from '@/app/components/ui/Toast';
import { useToast } from '@/modules/shared/hooks/useToast';
import { useConfirm } from '@/modules/admin/shared/hooks/useConfirm';
import {
  DonationsHeader,
  DonationsFilters,
  DonationsTable,
  DonationsErrorState,
  DonationDetailModal,
  useDonationsData,
  useDonationActions,
  type Donation,
  type DonationEstado,
} from '@/modules/shared/donaciones';
import CancelarDonacionModal from '@/modules/admin/reportes/donaciones/components/CancelarDonacionModal';
import type { MotivoCancelacion } from '@/modules/admin/reportes/donaciones/types';

const LoadingState = () => (
  <div className="text-center py-12">
    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
    <p className="mt-4 text-gray-600">Cargando donaciones...</p>
  </div>
);

export default function DonationsReportPage() {
  const { toasts, showSuccess, showError, showWarning, hideToast } = useToast();
  const confirm = useConfirm();
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [donacionACancelar, setDonacionACancelar] = useState<Donation | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const { donations, filteredDonations, filters, counters, loadingState, errorMessage, hasFiltersApplied, refetch, setSearch, toggleEstado, togglePersonType, resetFilters, messages } =
    useDonationsData();

  const { processingId, updateEstado } = useDonationActions();

  const isLoading = loadingState === 'loading';
  const hasError = loadingState === 'error';

  const handleChangeEstado = useCallback(
    async (donation: Donation, estado: DonationEstado) => {
      if (estado === 'Cancelada') {
        setDonacionACancelar(donation);
        setIsCancelModalOpen(true);
        return;
      }

      const prompts: Record<Exclude<DonationEstado, 'Cancelada'>, { title: string; description: string; confirmLabel: string; variant: 'default' | 'danger' | 'warning' }> = {
        Pendiente: {
          title: `Marcar donación de ${donation.nombre_donante || 'donante'} como pendiente`,
          description: `La donación de ${donation.cantidad} ${donation.unidad_simbolo} de ${donation.tipo_producto} volverá al estado pendiente para ser reprogramada.`,
          confirmLabel: 'Mover a pendiente',
          variant: 'warning',
        },
        Aprobada: {
          title: `Confirmar aprobación de ${donation.tipo_producto}`,
          description: 'La donación se aprobará e integrará automáticamente al inventario de bodega del donante.',
          confirmLabel: 'Marcar como aprobada',
          variant: 'default',
        },
      };

      const prompt = prompts[estado as Exclude<DonationEstado, 'Cancelada'>];

      const confirmed = await confirm({ title: prompt.title, description: prompt.description, confirmLabel: prompt.confirmLabel, cancelLabel: 'Cancelar', variant: prompt.variant });
      if (!confirmed) return;

      const result = await updateEstado(donation, estado);

      if (!result.success) {
        showError(result.message);
        return;
      }

      if (result.warning) {
        showWarning(result.message);
      } else {
        showSuccess(result.message);
      }

      await refetch();
    },
    [updateEstado, showError, showSuccess, showWarning, refetch, confirm],
  );

  const handleViewDetails = useCallback((donation: Donation) => {
    setSelectedDonation(donation);
    setIsDetailModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsDetailModalOpen(false);
    setSelectedDonation(null);
  }, []);

  const handleConfirmCancelacion = useCallback(
    async (motivo: MotivoCancelacion, observaciones?: string) => {
      if (!donacionACancelar) return;

      const result = await updateEstado(donacionACancelar, 'Cancelada', { motivo, observaciones });

      if (!result.success) {
        showError(result.message);
        throw new Error(result.message);
      }

      if (result.warning) {
        showWarning(result.message);
      } else {
        showSuccess('Donación cancelada exitosamente');
      }

      setIsCancelModalOpen(false);
      setDonacionACancelar(null);
      await refetch();
    },
    [donacionACancelar, updateEstado, showError, showSuccess, showWarning, refetch],
  );

  const handleCloseCancelModal = useCallback(() => {
    setIsCancelModalOpen(false);
    setDonacionACancelar(null);
  }, []);

  const tableContent = useMemo(() => {
    if (isLoading) return <LoadingState />;

    return (
      <DonationsTable
        donations={filteredDonations}
        totalCount={donations.length}
        hasActiveFilters={hasFiltersApplied}
        onResetFilters={resetFilters}
        onChangeEstado={handleChangeEstado}
        onViewDetails={handleViewDetails}
        processingId={processingId}
        messages={{ noData: messages.noData, noFilteredData: messages.noFilteredData }}
      />
    );
  }, [isLoading, filteredDonations, donations.length, hasFiltersApplied, resetFilters, handleChangeEstado, handleViewDetails, processingId, messages.noData, messages.noFilteredData]);

  return (
    <DashboardLayout requiredRole="ADMINISTRADOR" title="Gestión de Donaciones" description="Seguimiento de donaciones y su impacto en el inventario">
      <div className="p-6 space-y-6">
        <DonationsHeader counters={counters} />

        {hasError && <DonationsErrorState message={errorMessage ?? messages.loadError} onRetry={refetch} />}

        <DonationsFilters
          filters={filters}
          onSearchChange={setSearch}
          onToggleEstado={toggleEstado}
          onTogglePersonType={togglePersonType}
          onRefresh={refetch}
          filteredCount={filteredDonations.length}
          totalCount={donations.length}
        />

        {tableContent}
      </div>

      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => hideToast(toast.id)} duration={5000} />
        ))}
      </div>

      <DonationDetailModal donation={selectedDonation} isOpen={isDetailModalOpen} onClose={handleCloseModal} />

      <CancelarDonacionModal
        isOpen={isCancelModalOpen}
        onClose={handleCloseCancelModal}
        donacion={donacionACancelar}
        onConfirm={handleConfirmCancelacion}
        isProcessing={processingId === donacionACancelar?.id}
      />
    </DashboardLayout>
  );
}
