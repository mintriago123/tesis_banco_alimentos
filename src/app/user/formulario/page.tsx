"use client";

import { useState } from "react";
import { useSupabase } from "@/app/components/SupabaseProvider";
import DashboardLayout from "@/app/components/DashboardLayout";
import { useInventoryStock } from "@/modules/user/hooks/useInventoryStock";
import { validarCantidadParaUnidad } from "@/lib/unidadConversion";
import { CheckCircle2, ClipboardCheck, Send, AlertTriangle, ShoppingBasket } from "lucide-react";
import { Alert } from '@/app/components/ui/Alert';
import { Button } from '@/app/components/ui/Button';
import {
  useDatosBasicosUsuario,
  useAlimentos,
  useUnidades,
  useUbicacion,
  useSolicitudes,
  UserInfoCard,
  UbicacionCard,
  AlimentoSelector,
  InventarioInfo,
  CantidadUnidadInputs,
  ComentariosInput,
  SolicitudFormData,
  Alimento,
  MESSAGES,
} from "@/modules/user";

export default function FormularioSolicitante() {
  const { supabase, user } = useSupabase();

  // Hooks de datos
  const { userData } = useDatosBasicosUsuario(supabase, user?.id);
  const {
    alimentosFiltrados,
    categorias,
    busqueda,
    filtroCategoria,
    setBusqueda,
    setFiltroCategoria,
    filtrarAlimentos,
    obtenerUnidadesAlimento,
  } = useAlimentos(supabase);
  const { unidades, loading: loadingUnidades } = useUnidades(supabase);
  const { ubicacion, setUbicacion } = useUbicacion();
  const { createSolicitud } = useSolicitudes(supabase, user?.id);

  // Hook de inventario
  const {
    stockInfo,
    loadingState: inventoryLoadingState,
    errorMessage: inventoryErrorMessage,
    checkStock,
    clearStock,
    isStockSufficient,
    getUnitCompatibilityMessage,
    getStockMessage,
  } = useInventoryStock(supabase);

  // Estados locales del formulario
  const [tipoAlimento, setTipoAlimento] = useState("");
  const [alimentoId, setAlimentoId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [unidadId, setUnidadId] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);

  // Estados para el selector de alimentos
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [alimentoSeleccionado, setAlimentoSeleccionado] = useState<Alimento | null>(null);

  // Manejadores
  const manejarBusquedaAlimento = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setBusqueda(valor);

    if (alimentoSeleccionado && valor !== alimentoSeleccionado.nombre) {
      setAlimentoSeleccionado(null);
      setTipoAlimento("");
      setAlimentoId(null);
    }

    filtrarAlimentos(valor);
    setMostrarDropdown(true);
  };

  const manejarFocusInput = () => {
    if (!alimentoSeleccionado) {
      setMostrarDropdown(true);
      filtrarAlimentos(busqueda);
    }
  };

  const manejarSeleccionAlimento = (alimento: Alimento) => {
    setAlimentoSeleccionado(alimento);
    setTipoAlimento(alimento.nombre);
    setAlimentoId(alimento.id);
    setBusqueda(alimento.nombre);
    setMostrarDropdown(false);

    // Limpiar unidad seleccionada cuando cambia el alimento
    setUnidadId("");

    // Consultar inventario automáticamente
    checkStock(alimento.nombre);
  };

  const limpiarSeleccion = () => {
    setAlimentoSeleccionado(null);
    setTipoAlimento("");
    setAlimentoId(null);
    setBusqueda("");
    setMostrarDropdown(true);
    filtrarAlimentos("", filtroCategoria);
    clearStock();
  };

  const manejarCambioCategoria = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const categoria = e.target.value;
    setFiltroCategoria(categoria);

    if (alimentoSeleccionado) {
      setAlimentoSeleccionado(null);
      setTipoAlimento("");
      setAlimentoId(null);
      setBusqueda("");
      clearStock();
    }

    filtrarAlimentos("", categoria);
    setMostrarDropdown(false);
  };

  const manejarBlurContainer = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setTimeout(() => {
        setMostrarDropdown(false);
      }, 150);
    }
  };

  const manejarCambioUbicacion = (lat: number, lng: number) => {
    setUbicacion({ latitud: lat, longitud: lng });
  };

  const manejarUseMaxStock = () => {
    if (stockInfo && stockInfo.producto_encontrado) {
      setCantidad(stockInfo.total_disponible.toString());
    }
  };

  // Obtener unidades disponibles para el alimento seleccionado
  const getUnidadesDisponibles = () => {
    if (!alimentoId) {
      return [];
    }

    // Obtener unidades específicas del alimento seleccionado
    const unidadesAlimento = obtenerUnidadesAlimento(alimentoId);
    const unidadesDisponibles = unidadesAlimento.length === 0
      ? unidades
      : unidadesAlimento.map(u => ({
          id: u.unidad_id,
          nombre: u.nombre,
          simbolo: u.simbolo,
        }));

    // Si el catálogo del alimento no tiene asociada la unidad del stock,
    // agregarla como respaldo para que el usuario pueda solicitarla.
    if (
      stockInfo?.producto_encontrado &&
      stockInfo.unidad_id &&
      !unidadesDisponibles.some((unidad) => unidad.id === stockInfo.unidad_id)
    ) {
      const unidadDeCatalogo = unidades.find((unidad) => unidad.id === stockInfo.unidad_id);
      return [
        ...unidadesDisponibles,
        unidadDeCatalogo ?? {
          id: stockInfo.unidad_id,
          nombre: stockInfo.unidad_nombre ?? 'Unidad disponible',
          simbolo: stockInfo.unidad_simbolo ?? '',
        },
      ];
    }

    return unidadesDisponibles;
  };

  const unidadSeleccionadaActual = getUnidadesDisponibles().find(
    (unidad) => unidad.id === parseInt(unidadId),
  );
  const simboloUnidadSeleccionada = unidadSeleccionadaActual?.simbolo;
  const unitCompatibilityMessage = getUnitCompatibilityMessage(simboloUnidadSeleccionada);
  const cantidadSolicitadaActual = parseFloat(cantidad) || 0;
  const stockBloqueaEnvio = Boolean(
    cantidadSolicitadaActual > 0 &&
      stockInfo?.producto_encontrado &&
      (!isStockSufficient(cantidadSolicitadaActual, simboloUnidadSeleccionada) ||
        unitCompatibilityMessage),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMensaje("");

    const cantidadNum = parseFloat(cantidad);

    if (!user || !userData || !tipoAlimento || !cantidad || cantidadNum <= 0 || !unidadId) {
      setMensaje(MESSAGES.VALIDATION.REQUIRED_FIELDS);
      setLoading(false);
      return;
    }

    // Verificar que la ubicación esté disponible
    if (!ubicacion || ubicacion.latitud === null || ubicacion.longitud === null) {
      setMensaje("Debes compartir tu ubicación para enviar la solicitud. Por favor, permite el acceso a tu ubicación en el navegador.");
      setLoading(false);
      return;
    }

    // Obtener el símbolo de la unidad seleccionada
    const unidadSeleccionada = unidadSeleccionadaActual;
    const simboloUnidadParaSolicitud = simboloUnidadSeleccionada || '';

    const cantidadUnidad = validarCantidadParaUnidad(cantidadNum, unidadSeleccionada ?? {});
    if (!cantidadUnidad.valid) {
      setMensaje(cantidadUnidad.error);
      setLoading(false);
      return;
    }

    // Verificar stock disponible si hay información de inventario
    if (stockInfo && stockInfo.producto_encontrado && !isStockSufficient(cantidadNum, simboloUnidadParaSolicitud)) {
      // Usar el mensaje del hook que ya maneja las conversiones correctamente
      const mensajeStock = getStockMessage(cantidadNum, simboloUnidadParaSolicitud);
      
      setMensaje(
        unitCompatibilityMessage
          ? mensajeStock
          : `${MESSAGES.SOLICITUD.STOCK_INSUFFICIENT} ${mensajeStock}`
      );
      setLoading(false);
      return;
    }

    const solicitudData: SolicitudFormData = {
      tipo_alimento: tipoAlimento,
      cantidad: cantidadNum,
      unidad_id: parseInt(unidadId),
      comentarios,
      latitud: ubicacion?.latitud || null,
      longitud: ubicacion?.longitud || null,
    };

    const success = await createSolicitud(solicitudData);

    if (success) {
      setMensaje(MESSAGES.SOLICITUD.SUCCESS_CREATE);
      // Limpiar formulario
      setTipoAlimento("");
      setAlimentoId(null);
      setAlimentoSeleccionado(null);
      setBusqueda("");
      setFiltroCategoria("");
      setCantidad("");
      setUnidadId("");
      setComentarios("");
      clearStock();
    } else {
      setMensaje(MESSAGES.SOLICITUD.ERROR_CREATE);
    }

    setTimeout(() => setMensaje(""), 3000);
    setLoading(false);
  };

  return (
    <DashboardLayout
      requiredRole="SOLICITANTE"
      title="Solicitar Alimentos"
      description="Rellena el formulario para enviar tu solicitud al Banco de Alimentos."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <section
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          aria-labelledby="solicitud-form-title"
        >
          {/* Mensajes */}
          {!ubicacion && (
            <Alert tipo="warning" mensaje="Ubicación requerida: permite el acceso a tu ubicación en el navegador para continuar." />
          )}
          {mensaje && (
            <Alert tipo={mensaje.includes("éxito") ? 'success' : 'error'} mensaje={mensaje} />
          )}

          {/* Encabezado equivalente al StepHeader de Nueva donación */}
          <div className="border-b border-slate-200 pb-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                <ShoppingBasket className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 id="solicitud-form-title" className="text-base font-semibold text-slate-800 sm:text-lg">
                  Detalles de la solicitud
                </h2>
                <p className="mt-1 max-w-xl text-sm leading-5 text-slate-500">
                  Especifica qué alimentos necesitas y la cantidad solicitada.
                </p>
              </div>
            </div>
          </div>

          {/* Información del usuario */}
          {userData && <UserInfoCard userData={userData} />}

          {/* Ubicación */}
          {ubicacion && (
            <UbicacionCard
              ubicacion={ubicacion}
              onUbicacionChange={manejarCambioUbicacion}
            />
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* Selector de alimentos */}
              <AlimentoSelector
                alimentos={[]}
                alimentosFiltrados={alimentosFiltrados}
                alimentoSeleccionado={alimentoSeleccionado}
                busqueda={busqueda}
                filtroCategoria={filtroCategoria}
                categorias={categorias}
                mostrarDropdown={mostrarDropdown}
                onBusquedaChange={manejarBusquedaAlimento}
                onCategoriaChange={manejarCambioCategoria}
                onAlimentoSelect={manejarSeleccionAlimento}
                onLimpiarSeleccion={limpiarSeleccion}
                onFocus={manejarFocusInput}
                onBlur={manejarBlurContainer}
              />

              {/* Información de inventario */}
              {alimentoSeleccionado && (
                <InventarioInfo
                  stockInfo={stockInfo}
                  loadingState={inventoryLoadingState}
                  errorMessage={inventoryErrorMessage || null}
                  cantidad={parseFloat(cantidad) || 0}
                  simboloUnidad={simboloUnidadSeleccionada}
                  isStockSufficient={isStockSufficient}
                  getStockMessage={getStockMessage}
                  onUseMaxStock={manejarUseMaxStock}
                />
              )}

              {/* Cantidad y Unidad */}
              <CantidadUnidadInputs
                cantidad={cantidad}
                unidadId={unidadId}
                unidades={getUnidadesDisponibles()}
                loadingUnidades={loadingUnidades === 'loading'}
                stockInfo={stockInfo}
                unitCompatibilityMessage={unitCompatibilityMessage}
                isStockSufficient={isStockSufficient}
                onCantidadChange={(e) => setCantidad(e.target.value)}
                onUnidadChange={(e) => setUnidadId(e.target.value)}
                onUseMaxStock={manejarUseMaxStock}
              />

              {/* Comentarios */}
              <ComentariosInput
                comentarios={comentarios}
                onChange={(e) => setComentarios(e.target.value)}
              />
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <Button
                type="submit"
                disabled={
                  loading ||
                  !ubicacion ||
                  stockBloqueaEnvio
                }
                loading={loading}
                accent="solicitante"
                className="w-full sm:w-auto"
              >
                {loading ? (
                  "Enviando Solicitud..."
                ) : !ubicacion ? (
                  <>
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    Ubicación Requerida
                  </>
              ) : stockBloqueaEnvio ? (
                  <>
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    {unitCompatibilityMessage ? 'Unidad no compatible' : 'Stock insuficiente'}
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" aria-hidden="true" />
                    Enviar Solicitud
                  </>
                )}
              </Button>
            </div>
          </form>
        </section>

        <aside
          className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6"
          aria-labelledby="solicitud-context-title"
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="solicitud-context-title" className="text-base font-semibold text-slate-800">
                Tu solicitud cuenta
              </h2>
              <p className="mt-1 text-sm leading-5 text-slate-500">
                Completa la información para que el Banco de Alimentos pueda revisar tu pedido.
              </p>
            </div>
          </div>

          <ol className="space-y-4">
            {[
              'Selecciona el alimento que necesitas.',
              'Indica la cantidad y unidad de medida.',
              'Comparte tu ubicación para coordinar la entrega.',
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm leading-5 text-slate-500">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-blue-700">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-5 text-blue-800">
            <p className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
              Puedes revisar el estado de tu solicitud desde “Mis solicitudes”.
            </p>
          </div>
        </aside>
      </div>
    </DashboardLayout>
  );
}
