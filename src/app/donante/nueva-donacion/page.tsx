'use client';

import { useState, useEffect, useRef } from 'react';
import { useSupabase } from '@/app/components/SupabaseProvider';
import DashboardLayout from '@/app/components/DashboardLayout';
import { validarCantidadParaUnidad } from '@/lib/unidadConversion';
import { Package, MapPin, Heart } from 'lucide-react';
import {
  StepIndicator,
  StepHeader,
  StepNavigation,
  ProductSelector,
  DonationContextPanel,
  ImpactEquivalenceTable,
  DonationSummary,
  useProductSelector,
  useCatalogData,
  useUserProfile,
  useMultiStepForm,
  useFormValidation,
  useNuevaDonacionSubmit,
  HORARIOS_DISPONIBLES,
  calcularImpacto
} from '@/modules/donante';

// Función auxiliar para obtener la fecha de hoy en formato YYYY-MM-DD en hora local
const obtenerFechaHoy = () => {
  const hoy = new Date();
  const año = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${año}-${mes}-${dia}`;
};

export default function NuevaDonacionPage() {
  const { supabase, user: currentUser, isLoading: authLoading } = useSupabase();
  const mensajeValidacionRef = useRef<HTMLDivElement>(null);

  // Hook de navegación multi-paso
  const { pasoActual, siguientePaso: avanzarPaso, pasoAnterior, resetearPaso } = useMultiStepForm(3);

  // Hook para cargar catálogos
  const { alimentos, unidades, cargandoAlimentos, cargandoUnidades, categoriasUnicas, obtenerUnidadesAlimento } = useCatalogData(supabase, authLoading);

  // Hook para perfil de usuario
  const { userProfile } = useUserProfile(supabase, currentUser, authLoading);

  // Hook para envío de donación
  const { enviando, mensaje, enviarDonacion, limpiarMensaje } = useNuevaDonacionSubmit(supabase, currentUser, userProfile);

  // Hook para validación de formulario
  const { mensajeValidacion, setMensajeValidacion, limpiarMensajeValidacion } = useFormValidation();

  // Hook para selector de productos
  const {
    busquedaAlimento,
    alimentosFiltrados,
    mostrarDropdown,
    alimentoSeleccionado,
    filtroCategoria,
    setMostrarDropdown,
    manejarBusquedaAlimento,
    manejarFocusInput,
    manejarSeleccionProducto,
    limpiarSeleccion,
    manejarCambioCategoria,
    manejarBlurContainer,
  } = useProductSelector(
    alimentos,
    (id: string) => {
      setFormulario(prev => ({
        ...prev,
        tipo_producto: id,
        unidad_id: ''
      }));
    },
    limpiarMensaje
  );

  // Estado del formulario
  const [formulario, setFormulario] = useState({
    // Paso 1: Información del producto
    tipo_producto: '',
    cantidad: '',
    unidad_id: '',
    fecha_vencimiento: '',

    // Paso 2: Logística
    fecha_disponible: '',
    direccion_entrega: '',
    horario_preferido: '',

    // Paso 3: Detalles adicionales
    observaciones: '',
  });

  // Inicializar dirección cuando se carga el perfil
  useEffect(() => {
    if (userProfile?.direccion && !formulario.direccion_entrega) {
      setFormulario(prev => ({
        ...prev,
        direccion_entrega: userProfile.direccion
      }));
    }
  }, [userProfile, formulario.direccion_entrega]);

  // Obtener unidades disponibles para el alimento seleccionado
  const getUnidadesDisponibles = () => {
    if (!formulario.tipo_producto) {
      return [];
    }

    // Obtener unidades específicas del alimento seleccionado
    const unidadesAlimento = obtenerUnidadesAlimento(parseInt(formulario.tipo_producto));
    
    // Si el alimento no tiene unidades configuradas, mostrar todas
    if (unidadesAlimento.length === 0) {
      return unidades;
    }

    // Convertir UnidadAlimento a Unidad
    return unidadesAlimento.map(u => ({
      id: u.unidad_id,
      nombre: u.nombre,
      simbolo: u.simbolo
    }));
  };

  // Obtener información del producto seleccionado
  const getProductoSeleccionado = () => {
    const alimento = alimentos.find(a => a.id.toString() === formulario.tipo_producto);
    return alimento ? { nombre: alimento.nombre, categoria: alimento.categoria } : null;
  };

  // Obtener información de la unidad seleccionada
  const getUnidadSeleccionada = () => {
    const unidad = unidades.find(u => u.id.toString() === formulario.unidad_id);
    return unidad || null;
  };

  // Cálculo de impacto estimado usando la utilidad
  const calcularImpactoEstimado = () => {
    const unidadSeleccionada = getUnidadSeleccionada();
    const productoInfo = getProductoSeleccionado();
    if (!unidadSeleccionada) {
      return { personasAlimentadas: 0, comidaEquivalente: '' };
    }
    return calcularImpacto(formulario.cantidad, unidadSeleccionada.simbolo, productoInfo?.categoria, productoInfo?.nombre);
  };

  const manejarCambio = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormulario((prev) => ({ ...prev, [name]: value }));
    limpiarMensajeValidacion();
  };

  const mostrarErrorValidacion = (mensaje: string): false => {
    setMensajeValidacion(mensaje);
    window.requestAnimationFrame(() => mensajeValidacionRef.current?.focus());
    return false;
  };

  const validarPaso = (paso: number): boolean => {
    switch (paso) {
      case 1:
        if (!formulario.tipo_producto || !formulario.cantidad || !formulario.unidad_id) {
          return mostrarErrorValidacion('Por favor, completa la información del producto.');
        }
        if (!alimentos.some(alimento => alimento.id.toString() === formulario.tipo_producto)) {
          return mostrarErrorValidacion('Selecciona un alimento existente del catálogo.');
        }
        if (parseFloat(formulario.cantidad) <= 0) {
          return mostrarErrorValidacion('La cantidad debe ser mayor a 0.');
        }
        const cantidadUnidad = validarCantidadParaUnidad(
          parseFloat(formulario.cantidad),
          getUnidadSeleccionada() ?? {}
        );
        if (!cantidadUnidad.valid) {
          return mostrarErrorValidacion(cantidadUnidad.error);
        }
        break;
      case 2:
        if (!formulario.fecha_disponible.trim() || !formulario.direccion_entrega.trim()) {
          return mostrarErrorValidacion('Por favor, completa la información de logística.');
        }
        // Comparar las fechas como strings en formato YYYY-MM-DD
        const fechaHoyString = obtenerFechaHoy();
        if (formulario.fecha_disponible < fechaHoyString) {
          return mostrarErrorValidacion('La fecha de disponibilidad no puede ser anterior a hoy.');
        }
        break;
    }
    return true;
  };

  const siguientePaso = () => {
    if (validarPaso(pasoActual)) {
      avanzarPaso();
      limpiarMensajeValidacion();
    }
  };

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validarPaso(pasoActual)) {
      return;
    }

    const impacto = calcularImpactoEstimado();
    const productoInfo = getProductoSeleccionado();
    const unidadInfo = getUnidadSeleccionada();

    const exito = await enviarDonacion(
      formulario,
      impacto,
      productoInfo,
      unidadInfo,
      alimentos
    );

    if (exito) {
      // Reiniciar formulario
      setFormulario({
        tipo_producto: '',
        cantidad: '',
        unidad_id: '',
        fecha_vencimiento: '',
        fecha_disponible: '',
        direccion_entrega: userProfile?.direccion || '',
        horario_preferido: '',
        observaciones: '',
      });
      limpiarSeleccion();
      resetearPaso();
    }
  };

  const renderPaso = () => {
    switch (pasoActual) {
      case 1:
        return (
          <div className="space-y-6">
            <StepHeader 
              icon={Package}
              title="Información del Producto"
              description="Selecciona qué vas a donar"
              iconColor="text-emerald-600"
            />

            <div className="space-y-4">
              <div className="relative" onBlur={manejarBlurContainer}>
                <label htmlFor="categoria-alimentos" className="mb-1 block text-sm font-medium text-slate-700">
                  Categoría de alimentos <span aria-hidden="true">*</span>
                </label>

                <div className="mb-3">
                  <select
                    id="categoria-alimentos"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    value={filtroCategoria}
                    onChange={manejarCambioCategoria}
                    aria-describedby="categoria-alimentos-ayuda"
                  >
                    <option value="">Todas las categorías</option>
                    {categoriasUnicas.map((categoria) => (
                      <option key={categoria} value={categoria}>{categoria}</option>
                    ))}
                  </select>
                  <p id="categoria-alimentos-ayuda" className="mt-1 text-xs text-slate-500">Filtra el catálogo por tipo de alimento.</p>
                </div>

                <ProductSelector
                  busqueda={busquedaAlimento}
                  onBusquedaChange={manejarBusquedaAlimento}
                  onFocus={manejarFocusInput}
                  alimentoSeleccionado={alimentoSeleccionado}
                  onLimpiarSeleccion={limpiarSeleccion}
                  mostrarDropdown={mostrarDropdown}
                  cargando={cargandoAlimentos}
                  alimentosFiltrados={alimentosFiltrados}
                  onSeleccionarProducto={manejarSeleccionProducto}
                  onCerrarDropdown={() => setMostrarDropdown(false)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cantidad-donacion" className="mb-1 block text-sm font-medium text-slate-700">
                    Cantidad <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="cantidad-donacion"
                    type="number"
                    name="cantidad"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    value={formulario.cantidad}
                    onChange={manejarCambio}
                    placeholder="0"
                    min="0.1"
                    step="0.1"
                    inputMode="decimal"
                    required
                    aria-required="true"
                    aria-describedby="cantidad-ayuda"
                  />
                  <p id="cantidad-ayuda" className="mt-1 text-xs text-slate-500">Ingresa la cantidad disponible.</p>
                </div>

                <div>
                  <label htmlFor="unidad-donacion" className="mb-1 block text-sm font-medium text-slate-700">
                    Unidad de medida <span aria-hidden="true">*</span>
                  </label>
                  <select
                    id="unidad-donacion"
                    name="unidad_id"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    value={formulario.unidad_id}
                    onChange={manejarCambio}
                    required
                    aria-required="true"
                    aria-describedby="unidad-ayuda"
                  >
                    <option value="">Selecciona una unidad</option>
                    {cargandoUnidades ? (
                      <option disabled>Cargando unidades...</option>
                    ) : (
                      getUnidadesDisponibles().map((unidad) => (
                        <option key={unidad.id} value={unidad.id.toString()}>
                          {unidad.nombre} ({unidad.simbolo})
                        </option>
                      ))
                    )}
                  </select>
                  <p id="unidad-ayuda" className="mt-1 text-xs text-slate-500">
                    {formulario.tipo_producto 
                      ? 'Unidades permitidas para este alimento.'
                      : 'Selecciona primero un alimento.'}
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="fecha-vencimiento" className="mb-1 block text-sm font-medium text-slate-700">
                  Fecha de vencimiento <span className="font-normal text-slate-500">(opcional)</span>
                </label>
                <input
                  id="fecha-vencimiento"
                  type="date"
                  name="fecha_vencimiento"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={formulario.fecha_vencimiento}
                  onChange={manejarCambio}
                  min={obtenerFechaHoy()}
                />
              </div>

              <ImpactEquivalenceTable />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <StepHeader 
              icon={MapPin}
              title="Logística de Entrega"
              description="Dinos cuándo y dónde podemos recoger tu donación"
              iconColor="text-emerald-600"
            />

            <div className="space-y-4">
              <div>
                <label htmlFor="fecha-disponible" className="mb-1 block text-sm font-medium text-slate-700">
                  Fecha disponible <span aria-hidden="true">*</span>
                </label>
                <input
                  id="fecha-disponible"
                  type="date"
                  name="fecha_disponible"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={formulario.fecha_disponible}
                  onChange={manejarCambio}
                  min={obtenerFechaHoy()}
                  required
                  aria-required="true"
                />
              </div>

              <div>
                <label htmlFor="direccion-recoleccion" className="mb-1 block text-sm font-medium text-slate-700">
                  Dirección de recolección <span aria-hidden="true">*</span>
                </label>
                <input
                  id="direccion-recoleccion"
                  type="text"
                  name="direccion_entrega"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={formulario.direccion_entrega}
                  onChange={manejarCambio}
                  placeholder="Calle, número, ciudad y provincia"
                  maxLength={200}
                  autoComplete="street-address"
                  required
                  aria-required="true"
                />
              </div>

              <div>
                <label htmlFor="horario-preferido" className="mb-1 block text-sm font-medium text-slate-700">
                  Horario preferido <span className="font-normal text-slate-500">(opcional)</span>
                </label>
                <select
                  id="horario-preferido"
                  name="horario_preferido"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={formulario.horario_preferido}
                  onChange={manejarCambio}
                >
                  <option value="">Selecciona un horario</option>
                  {HORARIOS_DISPONIBLES.map((horario) => (
                    <option key={horario.value} value={horario.value}>
                      {horario.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );

      case 3:
        const { personasAlimentadas, comidaEquivalente } = calcularImpactoEstimado();
        const productoFinal = getProductoSeleccionado();
        const unidadFinal = getUnidadSeleccionada();
        return (
          <div className="space-y-6">
            <StepHeader 
              icon={Heart}
              title="Confirmación y Detalles Adicionales"
              description="Revisa tu donación y añade cualquier observación"
              iconColor="text-emerald-600"
            />

            <div className="space-y-4">
              <DonationSummary
                donante={userProfile?.nombre || currentUser?.email || 'Usuario Anónimo'}
                producto={productoFinal}
                cantidad={formulario.cantidad}
                unidad={unidadFinal}
                fechaDisponible={formulario.fecha_disponible}
                direccion={formulario.direccion_entrega}
                horario={formulario.horario_preferido}
                horarioLabel={HORARIOS_DISPONIBLES.find(h => h.value === formulario.horario_preferido)?.label}
                personasAlimentadas={personasAlimentadas}
                comidaEquivalente={comidaEquivalente}
              />

              <div>
                <label htmlFor="observaciones-donacion" className="mb-1 block text-sm font-medium text-slate-700">
                  Observaciones adicionales <span className="font-normal text-slate-500">(opcional)</span>
                </label>
                <textarea
                  id="observaciones-donacion"
                  name="observaciones"
                  className="min-h-32 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={formulario.observaciones}
                  onChange={manejarCambio}
                  placeholder="Cualquier información adicional que consideres importante..."
                  rows={4}
                  maxLength={500}
                  aria-describedby="observaciones-ayuda"
                />
                <p id="observaciones-ayuda" className="mt-1 text-xs text-slate-500">Máximo 500 caracteres.</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <DashboardLayout
      requiredRole="DONANTE"
      title="Nueva donación"
      description="Registra los alimentos y coordina su llegada al Banco de Alimentos"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="current-step-title">
          {mensaje && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${
              mensaje.includes('exitosa')
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`} role="status" aria-live="polite">
              {mensaje}
            </div>
          )}
          {mensajeValidacion && (
            <div
              ref={mensajeValidacionRef}
              id="donation-validation-message"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              role="alert"
              tabIndex={-1}
            >
              {mensajeValidacion}
            </div>
          )}
          <div className="border-b border-slate-200 pb-5">
            <StepIndicator
              currentStep={pasoActual}
              totalSteps={3}
              stepLabels={['Producto', 'Logística', 'Confirmación']}
            />
          </div>

          <form onSubmit={manejarEnvio}>
            {renderPaso()}

            <StepNavigation
              pasoActual={pasoActual}
              totalPasos={3}
              onAnterior={pasoAnterior}
              onSiguiente={siguientePaso}
              onEnviar={manejarEnvio}
              enviando={enviando}
            />
          </form>
        </section>

        <DonationContextPanel
          pasoActual={pasoActual}
          impacto={calcularImpactoEstimado()}
          mostrarImpacto={!!(formulario.cantidad && formulario.unidad_id)}
        />
      </div>
    </DashboardLayout>
  );
}
