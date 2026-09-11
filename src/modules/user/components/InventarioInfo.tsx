// ============================================================================
// Component: InventarioInfo
// Información del inventario disponible
// ============================================================================

import { Package, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { LoadingSpinner } from '@/app/components';
import { type StockSummary, type StockUnitSummary } from '../services/stockCalculations';
import { type LoadingState } from '../types';

interface InventarioInfoProps {
  stockInfo: StockSummary | null;
  loadingState: LoadingState;
  errorMessage: string | null;
  cantidad: number;
  simboloUnidad?: string;
  isStockSufficient: (cantidad: number, simboloUnidad?: string) => boolean;
  getStockMessage: (cantidad?: number, simboloUnidad?: string) => string;
  onUseMaxStock: () => void;
}

export function InventarioInfo({
  stockInfo,
  loadingState,
  errorMessage,
  cantidad,
  simboloUnidad,
  isStockSufficient,
  getStockMessage,
}: InventarioInfoProps) {
  if (!stockInfo && loadingState === 'idle') return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="inventario-disponible-title">
      <h3 id="inventario-disponible-title" className="mb-3 flex items-center text-sm font-semibold text-slate-800">
        <Package className="mr-2 h-4 w-4" aria-hidden="true" />
        Inventario Disponible
      </h3>

      {loadingState === 'loading' && (
        <div className="flex items-center text-sm text-blue-700" role="status" aria-live="polite">
          <div className="inline-block mr-2">
            <LoadingSpinner size="sm" color="blue" />
          </div>
          Consultando inventario...
        </div>
      )}

      {loadingState === 'error' && errorMessage && (
        <div className="flex items-center text-sm text-rose-700" role="alert">
          <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" />
          {errorMessage}
        </div>
      )}

      {loadingState === 'success' && stockInfo && (
        <div className="space-y-2">
          {stockInfo.producto_encontrado ? (
            <>
              <div
                className={`flex items-center text-sm font-semibold ${
                  stockInfo.unidades_disponibles.length > 0
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}
              >
                {stockInfo.unidades_disponibles.length > 0 ? (
                  <CheckCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {getStockMessage(cantidad || undefined, simboloUnidad)}
              </div>

              {stockInfo.unidades_disponibles.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-3" aria-label="Stock disponible por unidad">
                  <p className="mb-2 text-xs font-semibold text-slate-600">Disponible por unidad</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {stockInfo.unidades_disponibles.map((unidad: StockUnitSummary) => (
                      <div key={unidad.unidad_id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                        <span className="block text-xs text-slate-500">{unidad.unidad_nombre || unidad.unidad_simbolo || 'Unidad'}</span>
                        <span className="text-sm font-semibold text-slate-800">
                          {unidad.cantidad_formateada.cantidad} {unidad.unidad_simbolo || unidad.unidad_nombre || 'unidades'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {cantidad > 0 && stockInfo.unidades_disponibles.length > 0 && (
                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs text-blue-800">
                    💡{' '}
                    {isStockSufficient(cantidad, simboloUnidad)
                      ? 'Hay suficiente stock para tu solicitud'
                      : getStockMessage(cantidad, simboloUnidad)}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center text-sm text-amber-700">
              <Info className="mr-2 h-4 w-4" aria-hidden="true" />
              Este producto no está disponible en el inventario actual
            </div>
          )}
        </div>
      )}
    </section>
  );
}
