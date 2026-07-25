import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ExternalLink, ShoppingBasket, X } from 'lucide-react';

interface Alimento {
  id: number;
  nombre: string;
  categoria: string;
}

interface ProductSelectorProps {
  busqueda: string;
  onBusquedaChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  alimentoSeleccionado: Alimento | null;
  onLimpiarSeleccion: () => void;
  mostrarDropdown: boolean;
  cargando: boolean;
  alimentosFiltrados: Alimento[];
  onSeleccionarProducto: (alimento: Alimento) => void;
  onCerrarDropdown: () => void;
}

export default function ProductSelector({
  busqueda,
  onBusquedaChange,
  onFocus,
  alimentoSeleccionado,
  onLimpiarSeleccion,
  mostrarDropdown,
  cargando,
  alimentosFiltrados,
  onSeleccionarProducto,
  onCerrarDropdown,
}: ProductSelectorProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [alimentosFiltrados, mostrarDropdown]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!mostrarDropdown) {
        onFocus();
        setActiveIndex(0);
      } else {
        setActiveIndex((index) => Math.min(index + 1, Math.max(alimentosFiltrados.length - 1, 0)));
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Enter' && mostrarDropdown && alimentosFiltrados[activeIndex]) {
      event.preventDefault();
      onSeleccionarProducto(alimentosFiltrados[activeIndex]);
      return;
    }

    if (event.key === 'Escape' && mostrarDropdown) {
      event.preventDefault();
      onCerrarDropdown();
    }
  };

  return (
    <div className="relative">
      <label htmlFor="producto-donacion" className="mb-1 block text-sm font-medium text-slate-700">
        Producto a donar <span aria-hidden="true">*</span>
      </label>
      <div className="relative">
        <input
          id="producto-donacion"
          type="text"
          placeholder="Buscar o seleccionar producto..."
          className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-12 text-sm text-slate-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
          value={busqueda}
          onChange={onBusquedaChange}
          onFocus={onFocus}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mostrarDropdown && !alimentoSeleccionado}
          aria-controls="producto-donacion-lista"
          aria-activedescendant={mostrarDropdown && !alimentoSeleccionado && alimentosFiltrados[activeIndex]
            ? `producto-opcion-${alimentosFiltrados[activeIndex].id}`
            : undefined}
          required
          aria-required="true"
          aria-describedby="producto-donacion-ayuda"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">
          <ShoppingBasket className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
          {alimentoSeleccionado && (
            <button
              type="button"
              onClick={onLimpiarSeleccion}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
              aria-label="Limpiar producto seleccionado"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {mostrarDropdown && !alimentoSeleccionado && (
        <div
          id="producto-donacion-lista"
          role="listbox"
          aria-label="Productos disponibles"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {cargando ? (
            <div className="p-3 text-center text-sm text-slate-500" role="status">Cargando productos...</div>
          ) : (
            <>
              {alimentosFiltrados.length > 0 ? (
                <>
                  {alimentosFiltrados.map((alimento, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      key={alimento.id}
                      id={`producto-opcion-${alimento.id}`}
                      className={`block w-full border-b border-gray-100 p-3 text-left last:border-b-0 ${
                        index === activeIndex ? 'bg-emerald-50' : 'hover:bg-gray-50'
                      } focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-400`}
                      onClick={() => onSeleccionarProducto(alimento)}
                    >
                      <span className="block font-medium text-gray-900">{alimento.nombre}</span>
                      <span className="mt-1 block text-sm text-gray-500">{alimento.categoria}</span>
                    </button>
                  ))}
                </>
              ) : busqueda ? (
                <div className="p-3 text-center text-sm text-gray-500">
                  No se encontraron productos que coincidan con &quot;{busqueda}&quot;
                  <Link
                    href="/donante/solicitar-alimento"
                    className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Solicitar alta de alimento
                  </Link>
                </div>
              ) : (
                <div className="p-3 text-center text-sm text-gray-500">
                  Busca y selecciona un alimento existente del catálogo.
                </div>
              )}
            </>
          )}
        </div>
      )}

      <p id="producto-donacion-ayuda" className="mt-1 text-xs text-slate-500">
        {alimentoSeleccionado
          ? 'Producto seleccionado. Puedes limpiarlo para elegir otro.'
          : busqueda && !cargando
            ? `${alimentosFiltrados.length} producto${alimentosFiltrados.length !== 1 ? 's' : ''} encontrado${alimentosFiltrados.length !== 1 ? 's' : ''}.`
            : 'Escribe para buscar en el catálogo.'}
      </p>
    </div>
  );
}
