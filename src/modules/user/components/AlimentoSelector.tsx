// ============================================================================
// Component: AlimentoSelector
// Selector de alimentos con búsqueda y filtros
// ============================================================================

import type { ChangeEvent, FocusEvent } from 'react';
import { ShoppingBasket, X, AlertCircle } from 'lucide-react';
import { Alimento } from '../types';
import { MESSAGES } from '../constants';
import { FormField, SelectInput, TextInput } from '@/app/components/ui/FormField';

interface AlimentoSelectorProps {
  alimentos: Alimento[];
  alimentosFiltrados: Alimento[];
  alimentoSeleccionado: Alimento | null;
  busqueda: string;
  filtroCategoria: string;
  categorias: string[];
  mostrarDropdown: boolean;
  onBusquedaChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onCategoriaChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  onAlimentoSelect: (alimento: Alimento) => void;
  onLimpiarSeleccion: () => void;
  onFocus: () => void;
  onBlur: (e: FocusEvent) => void;
}

export function AlimentoSelector({
  alimentosFiltrados,
  alimentoSeleccionado,
  busqueda,
  filtroCategoria,
  categorias,
  mostrarDropdown,
  onBusquedaChange,
  onCategoriaChange,
  onAlimentoSelect,
  onLimpiarSeleccion,
  onFocus,
  onBlur,
}: AlimentoSelectorProps) {
  return (
    <div className="space-y-4">
      {/* Filtro de Categoría */}
      <FormField id="filtroCategoria" label="Categoría de alimentos" hint="Filtra por categoría para encontrar alimentos más fácilmente">
        {categorias.length === 0 ? (
            <div className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <span className="text-sm text-amber-700">
              {MESSAGES.SOLICITUD.NO_CATEGORY_AVAILABLE}
            </span>
          </div>
        ) : (
          <SelectInput
            id="filtroCategoria"
            className="min-h-11 px-4"
            value={filtroCategoria}
            onChange={onCategoriaChange}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((categoria) => (
              <option key={categoria} value={categoria}>
                {categoria}
              </option>
            ))}
          </SelectInput>
        )}
      </FormField>

      {/* Buscador de Productos */}
      <FormField id="tipoAlimento" label="Producto" required>
        <div className="relative" onBlur={onBlur}>
          <TextInput
            type="text"
            id="tipoAlimento"
            placeholder="Buscar o seleccionar producto..."
            className="min-h-11 px-4 pl-11 pr-12"
            value={busqueda}
            onChange={onBusquedaChange}
            onFocus={onFocus}
            required
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={mostrarDropdown && !alimentoSeleccionado}
            aria-controls="alimentos-disponibles"
          />
          <ShoppingBasket className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />

          {alimentoSeleccionado && (
            <button
              type="button"
              onClick={onLimpiarSeleccion}
              className="absolute right-2 top-1/2 min-h-9 min-w-9 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              title="Limpiar selección"
              aria-label="Limpiar producto seleccionado"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Dropdown con los alimentos filtrados */}
          {mostrarDropdown && !alimentoSeleccionado && (
            <div id="alimentos-disponibles" role="listbox" className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-[var(--shadow-popover)]">
              {alimentosFiltrados.length > 0 ? (
                alimentosFiltrados.map((alimento) => (
                    <button
                      type="button"
                      key={alimento.id}
                      className="block min-h-11 w-full border-b border-slate-100 p-3 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none last:border-b-0"
                      onClick={() => onAlimentoSelect(alimento)}
                      role="option"
                      aria-selected={false}
                    >
                    <div className="font-semibold text-slate-900">
                      {alimento.nombre}
                    </div>
                    <div className="text-sm text-slate-500">
                      {alimento.categoria}
                    </div>
                  </button>
                ))
              ) : busqueda || filtroCategoria ? (
                <div className="p-3 text-center text-sm text-slate-500">
                  No se encontraron productos que coincidan con tu búsqueda
                  {filtroCategoria && ` en la categoría "${filtroCategoria}"`}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 p-3 text-center text-sm text-amber-700">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {filtroCategoria 
                      ? `Escribe para buscar productos en "${filtroCategoria}"...` 
                      : MESSAGES.SOLICITUD.NO_STOCK_AVAILABLE}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Mostrar contador de resultados */}
          {(busqueda || filtroCategoria) && !alimentoSeleccionado && (
            <p className="mt-1 text-xs text-slate-500">
              {alimentosFiltrados.length} producto
              {alimentosFiltrados.length !== 1 ? 's' : ''} disponible
              {alimentosFiltrados.length !== 1 ? 's' : ''}
              {filtroCategoria && ` en "${filtroCategoria}"`}
            </p>
          )}
          
          {/* Mensaje cuando no hay productos en absoluto */}
          {!busqueda && !filtroCategoria && alimentosFiltrados.length === 0 && !mostrarDropdown && (
            <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              {MESSAGES.SOLICITUD.NO_STOCK_AVAILABLE}
            </p>
          )}
        </div>
      </FormField>
    </div>
  );
}
