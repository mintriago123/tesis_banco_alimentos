// ============================================================================
// Component: InventarioInfo
// Información del inventario disponible
// ============================================================================

import { Package, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { LoadingSpinner } from '@/app/components';
import { type StockSummary } from '../services/inventoryStockService';
import { type LoadingState } from '../types';

/**
 * Formatea una cantidad numérica con máximo 2 decimales.
 */
const formatQuantity = (cantidad: number): string => {
  if (Number.isInteger(cantidad)) {
    return cantidad.toString();
  }
  return cantidad.toFixed(2).replace(/\.?0+$/, '');
};

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
                  stockInfo.total_disponible > 0
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}
              >
                {stockInfo.total_disponible > 0 ? (
                  <CheckCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {getStockMessage(cantidad || undefined, simboloUnidad)}
              </div>

              {cantidad > 0 && stockInfo.total_disponible > 0 && (
                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs text-blue-800">
                    💡{' '}
                    {isStockSufficient(cantidad, simboloUnidad)
                      ? 'Hay suficiente stock para tu solicitud'
                      : `Cantidad disponible insuficiente. Considera reducir a máximo ${
                          stockInfo.total_formateado && stockInfo.total_formateado.fue_convertido
                            ? `${stockInfo.total_formateado.cantidad} ${stockInfo.total_formateado.simbolo}`
                            : `${formatQuantity(stockInfo.total_disponible)} ${stockInfo.unidad_simbolo || stockInfo.unidad_nombre || 'unidades'}`
                        }`}
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
