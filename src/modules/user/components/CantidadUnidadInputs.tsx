// ============================================================================
// Component: CantidadUnidadInputs
// Inputs de cantidad y unidad de medida
// ============================================================================

import type { ChangeEvent } from 'react';
import { Unidad } from '../types';
import { type StockSummary } from '../services/inventoryStockService';
import { FORM_CONFIG } from '../constants';
import { FormField, SelectInput, TextInput } from '@/app/components/ui/FormField';

interface CantidadUnidadInputsProps {
  cantidad: string;
  unidadId: string;
  unidades: Unidad[];
  loadingUnidades: boolean;
  stockInfo: StockSummary | null;
  isStockSufficient: (cantidad: number, simboloUnidad?: string) => boolean;
  onCantidadChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onUnidadChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  onUseMaxStock: () => void;
}

export function CantidadUnidadInputs({
  cantidad,
  unidadId,
  unidades,
  loadingUnidades,
  stockInfo,
  isStockSufficient,
  onCantidadChange,
  onUnidadChange,
}: CantidadUnidadInputsProps) {
  const cantidadNum = parseFloat(cantidad) || 0;
  const unidadSeleccionada = unidades.find(u => u.id === parseInt(unidadId));
  const simboloUnidad = unidadSeleccionada?.simbolo;
  const hasSufficientStock =
    !stockInfo ||
    !stockInfo.producto_encontrado ||
    isStockSufficient(cantidadNum, simboloUnidad);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Cantidad */}
      <FormField id="cantidad" label="Cantidad solicitada" required hint="Ingresa la cantidad necesaria">
        <TextInput
          type="number"
          id="cantidad"
          value={cantidad}
          onChange={onCantidadChange}
          required
          min={FORM_CONFIG.CANTIDAD_MIN}
          step={FORM_CONFIG.CANTIDAD_STEP}
          className={`min-h-11 px-4 ${
            cantidadNum > 0 &&
            stockInfo &&
            stockInfo.producto_encontrado
              ? hasSufficientStock
                ? 'border-emerald-500 focus:border-emerald-600'
                : 'border-rose-500 focus:border-rose-600'
              : 'border-slate-300 focus:border-blue-600'
          }`}
          placeholder="0"
        />
        <div className="mt-1 space-y-1">
          {cantidadNum > 0 &&
            stockInfo &&
            stockInfo.producto_encontrado && (
              <p
                className={`text-xs font-medium ${
                  hasSufficientStock ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {hasSufficientStock
                  ? '✓ Cantidad disponible en inventario'
                  : `⚠️ Excede el stock disponible (${
                      stockInfo.total_formateado 
                        ? `${stockInfo.total_formateado.cantidad} ${stockInfo.total_formateado.simbolo}`
                        : `${stockInfo.total_disponible} ${stockInfo.unidad_simbolo || stockInfo.unidad_nombre || 'unidades'}`
                    } máximo)`}
              </p>
            )}
        </div>
      </FormField>

      {/* Unidad */}
      <FormField id="unidad" label="Unidad de medida" required hint="Selecciona la unidad de medida">
        <SelectInput
          id="unidad"
          value={unidadId}
          onChange={onUnidadChange}
          required
          className="min-h-11 px-4"
        >
          <option value="">Selecciona una unidad</option>
          {loadingUnidades ? (
            <option disabled>Cargando unidades...</option>
          ) : (
            unidades.map((unidad) => (
              <option key={unidad.id} value={unidad.id}>
                {unidad.nombre} ({unidad.simbolo})
              </option>
            ))
          )}
        </SelectInput>
      </FormField>
    </div>
  );
}
