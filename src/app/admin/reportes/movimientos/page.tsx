'use client';

import React, { useState, useCallback } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';

import { useMovementsData, useReportFilters, useExportReport } from '@/modules/admin/reportes/movimientos/hooks/useMovementsData';

import ReportHeader from '@/modules/admin/reportes/movimientos/components/ReportHeader';
import MovementFilters from '@/modules/admin/reportes/movimientos/components/MovementFilters';
import MovementTable from '@/modules/admin/reportes/movimientos/components/MovementTable';
import MovementSummary from '@/modules/admin/reportes/movimientos/components/MovementSummary';
import MovementDetailModal from '@/modules/admin/reportes/movimientos/components/MovementDetailModal';

import { SYSTEM_MESSAGES } from '@/modules/admin/reportes/movimientos/constants';

import type { MovementItem } from '@/modules/admin/reportes/movimientos/types';

const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-6">
    <div className="flex items-center">
      <div className="flex-shrink-0">
        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <div className="ml-3">
        <h3 className="text-sm font-medium text-red-800">Error al cargar el reporte</h3>
        <p className="mt-1 text-sm text-red-700">{message}</p>
        {onRetry && (
          <div className="mt-3">
            <button
              type="button"
              onClick={onRetry}
              className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
);

export default function MovementsReportPage() {
  const [selectedMovement, setSelectedMovement] = useState<MovementItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const { filters, setFilter, clearFilters, filterDescriptions, hasActiveFilters } = useReportFilters();

  const { filteredData, summary, loadingState, errorMessage, lastUpdate, refetchData, hasData } = useMovementsData(filters);

  const { exportReport, isExporting, exportError, canExport } = useExportReport(filteredData, summary, filterDescriptions, lastUpdate);

  const isLoading = loadingState === 'loading';
  const hasError = loadingState === 'error';

  const handleRowClick = useCallback((movement: MovementItem) => {
    setSelectedMovement(movement);
    setIsDetailModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsDetailModalOpen(false);
    setSelectedMovement(null);
  }, []);

  return (
    <DashboardLayout requiredRole="ADMINISTRADOR" title="Reporte de Movimientos" description="Historial de ingresos y egresos de productos">
      <div className="space-y-6">
        <ReportHeader
          description="Análisis completo de ingresos y egresos de inventario"
          loading={isLoading}
          lastUpdate={lastUpdate}
          onRefresh={refetchData}
          onExport={exportReport}
          canExport={canExport && !isExporting}
        />

        {exportError && <ErrorState message={`Error en exportación: ${exportError}`} onRetry={exportReport} />}

        <MovementFilters filters={filters} onFilterChange={setFilter} onClearFilters={clearFilters} activeFilterDescriptions={filterDescriptions} disabled={isLoading} />

        {hasError && errorMessage && <ErrorState message={errorMessage} onRetry={refetchData} />}

        <MovementTable data={filteredData} loading={isLoading} emptyMessage={hasActiveFilters ? SYSTEM_MESSAGES.noFilteredData : SYSTEM_MESSAGES.noData} onRowClick={handleRowClick} />

        {(hasData || isLoading) && <MovementSummary summary={summary} loading={isLoading} />}
      </div>

      <MovementDetailModal movement={selectedMovement} isOpen={isDetailModalOpen} onClose={handleCloseModal} />
    </DashboardLayout>
  );
}
