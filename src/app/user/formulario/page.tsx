"use client";

import { useState } from "react";
import { useSupabase } from "@/app/components/SupabaseProvider";
import DashboardLayout from "@/app/components/DashboardLayout";
import { useInventoryStock } from "@/modules/user/hooks/useInventoryStock";
import { validarCantidadParaUnidad } from "@/lib/unidadConversion";
import { Send, AlertTriangle } from "lucide-react";
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
    const unidadSeleccionada = getUnidadesDisponibles().find(u => u.id === parseInt(unidadId));
    const simboloUnidadSeleccionada = unidadSeleccionada?.simbolo || '';

    const cantidadUnidad = validarCantidadParaUnidad(cantidadNum, unidadSeleccionada ?? {});
    if (!cantidadUnidad.valid) {
      setMensaje(cantidadUnidad.error);
      setLoading(false);
      return;
    }

    // Verificar stock disponible si hay información de inventario
    if (stockInfo && stockInfo.producto_encontrado && !isStockSufficient(cantidadNum, simboloUnidadSeleccionada)) {
      // Usar el mensaje del hook que ya maneja las conversiones correctamente
      const mensajeStock = getStockMessage(cantidadNum, simboloUnidadSeleccionada);
      
      setMensaje(
        `${MESSAGES.SOLICITUD.STOCK_INSUFFICIENT} ${mensajeStock}`
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
      <div className="space-y-6">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">

            {/* Información del usuario */}
            {userData && <UserInfoCard userData={userData} />}

            {/* Ubicación */}
            {ubicacion && (
              <UbicacionCard
                ubicacion={ubicacion}
                onUbicacionChange={manejarCambioUbicacion}
              />
            )}

            {/* Alerta de ubicación requerida */}
            {!ubicacion && (
              <Alert tipo="warning" mensaje="Ubicación requerida: permite el acceso a tu ubicación en el navegador para continuar." />
            )}

            {/* Mensajes */}
            {mensaje && (
              <Alert tipo={mensaje.includes("éxito") ? 'success' : 'error'} mensaje={mensaje} />
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-gray-800">
                  Detalles de la Solicitud
                </h3>
                <p className="text-gray-600">
                  Especifica qué alimentos necesitas
                </p>
              </div>

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
                    simboloUnidad={getUnidadesDisponibles().find(u => u.id === parseInt(unidadId))?.simbolo}
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

              <Button
                type="submit"
                disabled={
                  loading ||
                  !ubicacion ||
                  (!!cantidad &&
                    parseFloat(cantidad) > 0 &&
                    !!stockInfo &&
                    stockInfo.producto_encontrado &&
                    !isStockSufficient(
                      parseFloat(cantidad),
                      getUnidadesDisponibles().find(u => u.id === parseInt(unidadId))?.simbolo
                    ))
                }
                loading={loading}
                accent="solicitante"
              >
                {loading ? (
                  "Enviando Solicitud..."
                ) : !ubicacion ? (
                  <>
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    Ubicación Requerida
                  </>
                ) : !!cantidad &&
                  parseFloat(cantidad) > 0 &&
                  !!stockInfo &&
                  stockInfo.producto_encontrado &&
                  !isStockSufficient(
                    parseFloat(cantidad),
                    getUnidadesDisponibles().find(u => u.id === parseInt(unidadId))?.simbolo
                  ) ? (
                  <>
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    Stock Insuficiente
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    Enviar Solicitud
                  </>
                )}
              </Button>
            </form>
          </div>
      </div>
    </DashboardLayout>
  );
}
