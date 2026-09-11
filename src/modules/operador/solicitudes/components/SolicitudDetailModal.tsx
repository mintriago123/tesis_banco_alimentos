/**
 * @fileoverview Modal con detalle y acciones de una solicitud para operadores.
 */

import { CheckCircle, Clock, FileText, Mail, MapPin, MessageCircle, Phone, User, X, XCircle, QrCode, ExternalLink, Package, History } from 'lucide-react';
import type { JSX } from 'react';
import { useState, useEffect } from 'react';
import type { InventarioDisponible, Solicitud, SolicitudEstado } from '../types';
import type { HistorialDonacion } from '../services/historialDonacionesService';
import { fetchHistorialDonacionesAction } from '../actions';

const formatQuantity = (cantidad: number): string => {
  if (Number.isInteger(cantidad)) {
    return cantidad.toString();
  }
  return cantidad.toFixed(2).replace(/\.?0+$/, '');
};

interface SolicitudDetailModalProps {
  solicitud: Solicitud;
  comentarioAdmin: string;
  inventario: InventarioDisponible[];
  inventarioLoading: boolean;
  inventarioError?: string;
  formatDate: (value?: string | null) => string;
  badgeStyles: Record<SolicitudEstado, string>;
  estadoIcons: Record<SolicitudEstado, JSX.Element>;
  onClose: () => void;
  onComentarioChange: (value: string) => void;
  onAprobar: () => void;
  onRechazar: () => void;
  isProcessing: boolean;
  motivoRechazo?: string;
  onMotivoRechazoChange?: (value: string) => void;
  onDonar?: (cantidad: number, porcentaje: number, comentario: string) => void;
  abrirEnModoDonacion?: boolean;
  depositoSeleccionado: string;
  onDepositoSeleccionadoChange: (value: string) => void;
  cantidadAprobar: number;
  onCantidadAprobarChange: (value: number) => void;
}

const SolicitudDetailModal = ({
  solicitud,
  inventario,
  inventarioLoading,
  inventarioError,
  formatDate,
  badgeStyles,
  estadoIcons,
  onClose,
  onRechazar,
  isProcessing,
  onDonar,
  abrirEnModoDonacion = false,
  depositoSeleccionado,
  onDepositoSeleccionadoChange,
}: SolicitudDetailModalProps) => {
  const [cantidadDonar, setCantidadDonar] = useState<number>(0);
  const [comentarioDonacion, setComentarioDonacion] = useState<string>('');
  const [modoDonacion, setModoDonacion] = useState(abrirEnModoDonacion);
  const [historial, setHistorial] = useState<HistorialDonacion[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  useEffect(() => {
    const cargarHistorial = async () => {
      if (solicitud.tiene_entregas_parciales || (solicitud.cantidad_entregada && solicitud.cantidad_entregada > 0)) {
        setCargandoHistorial(true);
        const datos = await fetchHistorialDonacionesAction(solicitud.id);
        setHistorial(datos);
        setCargandoHistorial(false);
      }
    };
    void cargarHistorial();
  }, [solicitud.id, solicitud.tiene_entregas_parciales, solicitud.cantidad_entregada]);

  const totalDisponible = inventario.reduce((total, item) => total + (item.cantidad_disponible ?? 0), 0);

  const depositoActual = inventario.find((item) => item.id_deposito === depositoSeleccionado);
  const stockDepositoSeleccionado = depositoActual?.cantidad_disponible ?? 0;
  const maxDisponibleDeposito = Math.max(0, Math.min(solicitud.cantidad, stockDepositoSeleccionado));
  const permiteFraccion = solicitud.unidades?.permite_fraccion !== false;
  const cantidadUnidadValida = permiteFraccion || Number.isInteger(cantidadDonar);

  useEffect(() => {
    const maxDisponible = maxDisponibleDeposito;
    const cantidadInicial = maxDisponible;

    if (!inventarioLoading && cantidadInicial >= 0) {
      setCantidadDonar(cantidadInicial);
    }
  }, [maxDisponibleDeposito, inventarioLoading]);

  const handleDonacionSubmit = () => {
    if (onDonar && Number.isFinite(cantidadDonar) && cantidadDonar > 0 && cantidadDonar <= solicitud.cantidad && cantidadDonar <= maxDisponibleDeposito && cantidadUnidadValida) {
      const porcentaje = Math.round((cantidadDonar / solicitud.cantidad) * 100);
      onDonar(cantidadDonar, porcentaje, comentarioDonacion);
    }
  };

  const handleCantidadChange = (value: string) => {
    const cantidad = Number(value);
    const maxDisponible = maxDisponibleDeposito;
    setCantidadDonar(value.trim() === '' || !Number.isFinite(cantidad) ? 0 : Math.min(Math.max(0, cantidad), maxDisponible));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Detalles de la Solicitud</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                <User className="w-5 h-5 mr-2" />
                Información del Solicitante
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>Nombre:</strong> {solicitud.usuarios?.nombre ?? 'N/A'}
                </div>
                <div>
                  <strong>Cédula:</strong> {solicitud.usuarios?.cedula ?? 'N/A'}
                </div>
                <div>
                  <strong>Tipo:</strong> {solicitud.usuarios?.tipo_persona ?? 'N/A'}
                </div>
                <div className="flex items-center">
                  <Phone className="w-4 h-4 mr-1" />
                  {solicitud.usuarios?.telefono ?? 'N/A'}
                </div>
                <div className="flex items-center">
                  <Mail className="w-4 h-4 mr-1" />
                  {solicitud.usuarios?.email ?? 'N/A'}
                </div>
                {solicitud.usuarios?.direccion && (
                  <div>
                    <strong>Dirección:</strong> {solicitud.usuarios.direccion}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Detalles de la Solicitud
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>Alimento solicitado:</strong> {solicitud.tipo_alimento}
                </div>
                <div>
                  <strong>Cantidad:</strong> {solicitud.cantidad} {solicitud.unidades?.simbolo ?? 'unidades'}
                </div>
                <div>
                  <strong>Fecha de solicitud:</strong> {formatDate(solicitud.created_at)}
                </div>
                <div className="flex items-center space-x-2">
                  {estadoIcons[solicitud.estado]}
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${badgeStyles[solicitud.estado]}`}>{solicitud.estado}</span>
                </div>
                {solicitud.fecha_respuesta && (
                  <div>
                    <strong>Fecha de respuesta:</strong> {formatDate(solicitud.fecha_respuesta)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {solicitud.codigo_comprobante && (
            <div className="bg-gradient-to-r from-red-50 to-red-100 border border-red-200 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                <QrCode className="w-5 h-5 mr-2 text-red-600" />
                Código de Verificación
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Código de Comprobante</p>
                  <p className="font-mono font-bold text-lg text-red-700">{solicitud.codigo_comprobante}</p>
                </div>
                <a
                  href={`/operador/comprobante/${solicitud.codigo_comprobante}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver Comprobante
                </a>
              </div>
            </div>
          )}

          {((solicitud.estado === 'aprobada' && solicitud.cantidad_entregada && solicitud.cantidad_entregada > 0) || solicitud.tiene_entregas_parciales) && (
            <div
              className={`bg-gradient-to-r ${
                (solicitud.cantidad_entregada ?? 0) >= solicitud.cantidad ? 'from-green-50 to-emerald-50 border-2 border-green-300' : 'from-orange-50 to-amber-50 border-2 border-orange-300'
              } p-5 rounded-lg shadow-sm`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${(solicitud.cantidad_entregada ?? 0) >= solicitud.cantidad ? 'bg-green-500' : 'bg-orange-500'}`}>
                    <Package className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center text-lg">
                    {(solicitud.cantidad_entregada ?? 0) >= solicitud.cantidad ? '✅ Entrega Completa' : '⚠️ Entrega Parcial en Proceso'}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-white p-3 rounded-lg border border-orange-200">
                      <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Solicitado</p>
                      <p className="text-xl font-bold text-gray-900">
                        {solicitud.cantidad} {solicitud.unidades?.simbolo ?? 'unidades'}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-orange-200">
                      <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Entregado</p>
                      <p className={`text-xl font-bold ${(solicitud.cantidad_entregada ?? 0) >= solicitud.cantidad ? 'text-green-600' : 'text-orange-600'}`}>
                        {solicitud.cantidad_entregada ?? 0} {solicitud.unidades?.simbolo ?? 'unidades'}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-orange-200">
                      <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">{(solicitud.cantidad_entregada ?? 0) >= solicitud.cantidad ? 'Estado' : 'Pendiente'}</p>
                      {(solicitud.cantidad_entregada ?? 0) >= solicitud.cantidad ? (
                        <p className="text-xl font-bold text-green-600">Completo</p>
                      ) : (
                        <p className="text-xl font-bold text-orange-600">
                          {solicitud.cantidad - (solicitud.cantidad_entregada ?? 0)} {solicitud.unidades?.simbolo ?? 'unidades'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Progreso de Entrega</span>
                      <span className={`text-sm font-bold ${(solicitud.cantidad_entregada ?? 0) >= solicitud.cantidad ? 'text-green-600' : 'text-orange-600'}`}>
                        {Math.round(((solicitud.cantidad_entregada ?? 0) / solicitud.cantidad) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${
                          (solicitud.cantidad_entregada ?? 0) >= solicitud.cantidad ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-orange-500 to-amber-500'
                        }`}
                        style={{ width: `${Math.min(((solicitud.cantidad_entregada ?? 0) / solicitud.cantidad) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  {solicitud.comentario_admin && (
                    <div className="bg-white p-3 rounded-lg border border-orange-200">
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Comentario del Operador</p>
                      <p className="text-sm text-gray-800 italic">&quot;{solicitud.comentario_admin}&quot;</p>
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="w-4 h-4" />
                    <span>Última actualización: {formatDate(solicitud.fecha_respuesta || solicitud.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {solicitud.comentarios && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Comentarios del Solicitante
                </h4>
                <p className="text-sm text-gray-700">{solicitud.comentarios}</p>
              </div>
            )}

            {solicitud.estado === 'pendiente' && (
              <div className="bg-white p-4 rounded-lg border">
                <h4 className="font-semibold text-gray-900 mb-3">Inventario disponible para &quot;{solicitud.tipo_alimento}&quot;</h4>

                {inventarioLoading && <div className="text-center py-6 text-sm text-gray-500">Cargando inventario...</div>}

                {!inventarioLoading && inventarioError && <div className="text-center py-6 text-sm text-red-600">{inventarioError}</div>}

                {!inventarioLoading && !inventarioError && inventario.length > 0 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {inventario.map((item) => {
                        const unidad = item.unidad_simbolo || item.unidad_nombre || 'unidades';
                        const unidadOriginal = item.unidad_simbolo_original || item.unidad_nombre_original || unidad;
                        return (
                          <div key={item.id} className="border rounded-lg p-3">
                            <div className="font-semibold text-gray-900">{item.tipo_alimento}</div>
                            <div className="text-sm text-gray-600">Depósito: {item.deposito}</div>
                            <div className="text-sm text-gray-600">
                              Disponible: <span className="font-medium">{formatQuantity(item.cantidad_disponible)} {unidad}</span>
                            </div>
                            {item.fue_convertido && (
                              <div className="text-xs text-gray-500">
                                Equivale a {formatQuantity(item.cantidad_disponible_original)} {unidadOriginal} en inventario
                              </div>
                            )}
                            {item.fecha_vencimiento && <div className="text-xs text-gray-500">Actualizado: {formatDate(item.fecha_vencimiento)}</div>}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 p-3 bg-white rounded border">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">Resumen</div>
                        <div className="mt-1">
                          <span className="text-gray-600">Cantidad solicitada: </span>
                          <span className="font-semibold">
                            {solicitud.cantidad} {solicitud.unidades?.simbolo ?? 'unidades'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Total disponible: </span>
                          <span className={`font-semibold ${totalDisponible >= solicitud.cantidad ? 'text-green-600' : 'text-red-600'}`}>
                            {formatQuantity(totalDisponible)} {solicitud.unidades?.simbolo ?? 'unidades'}
                          </span>
                        </div>
                        <div className="mt-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Bodega para aprobación</label>
                          <select
                            value={depositoSeleccionado}
                            onChange={(event) => onDepositoSeleccionadoChange(event.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg"
                            disabled={isProcessing}
                          >
                            <option value="">Selecciona una bodega</option>
                            {inventario.map((item) => (
                              <option key={item.id} value={item.id_deposito}>
                                {item.deposito} - {formatQuantity(item.cantidad_disponible)} {item.unidad_simbolo || item.unidad_nombre || solicitud.unidades?.simbolo || 'unidades'}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <span className="text-gray-600">Disponible en bodega seleccionada: </span>
                          <span className={`font-semibold ${stockDepositoSeleccionado > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatQuantity(stockDepositoSeleccionado)} {solicitud.unidades?.simbolo ?? 'unidades'}
                          </span>
                        </div>
                        <div className="mt-2">
                          {totalDisponible >= solicitud.cantidad ? (
                            <div className="flex items-center text-green-600 text-sm">
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Suficiente stock disponible
                            </div>
                          ) : (
                            <div className="flex items-center text-red-600 text-sm">
                              <XCircle className="w-4 h-4 mr-1" />
                              Stock insuficiente ({formatQuantity(totalDisponible)} de {solicitud.cantidad} disponibles)
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!inventarioLoading && !inventarioError && inventario.length === 0 && (
                  <div className="text-center py-4">
                    <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">No hay stock disponible de &quot;{solicitud.tipo_alimento}&quot; en el inventario</p>
                    <p className="text-xs text-gray-500 mt-1">La solicitud no puede ser satisfecha en este momento</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {solicitud.latitud && solicitud.longitud && (
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                <MapPin className="w-4 h-4 mr-2" />
                Ubicación
              </h4>
              <div className="text-sm text-gray-700 mb-3">
                Coordenadas: {solicitud.latitud.toFixed(6)}, {solicitud.longitud.toFixed(6)}
              </div>
              <iframe
                title="Ubicación del solicitante"
                className="w-full h-64 rounded border"
                src={`https://maps.google.com/maps?q=${solicitud.latitud},${solicitud.longitud}&z=15&output=embed`}
              />
            </div>
          )}

          {(historial.length > 0 || cargandoHistorial) && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 p-6 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center text-lg">
                <History className="w-6 h-6 mr-2 text-blue-600" />
                Historial de Entregas
              </h3>

              {cargandoHistorial ? (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  <p className="mt-2 text-sm text-gray-600">Cargando historial...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-white p-4 rounded-lg border-2 border-blue-300">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-gray-600 uppercase">Total Solicitado</p>
                        <p className="text-lg font-bold text-gray-900">
                          {solicitud.cantidad} {solicitud.unidades?.simbolo ?? 'unidades'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase">Total Entregado</p>
                        <p className="text-lg font-bold text-green-600">
                          {solicitud.cantidad_entregada || 0} {solicitud.unidades?.simbolo ?? 'unidades'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase">% Completado</p>
                        <p className="text-lg font-bold text-blue-600">{Math.round(((solicitud.cantidad_entregada || 0) / solicitud.cantidad) * 100)}%</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {historial.map((entrega, index) => (
                      <div key={entrega.id} className="bg-white p-4 rounded-lg border">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{historial.length - index}</span>
                              <span className="font-semibold text-gray-900">
                                {entrega.cantidad_entregada} {solicitud.unidades?.simbolo ?? 'unidades'}
                              </span>
                              <span className="text-sm text-gray-600">({entrega.porcentaje_entregado}% del total)</span>
                            </div>
                            <div className="text-xs text-gray-600 space-y-1">
                              <p>
                                <strong>Fecha:</strong> {formatDate(entrega.created_at)}
                              </p>
                              {entrega.operador && (
                                <p>
                                  <strong>Por:</strong> {entrega.operador.nombre} ({entrega.operador.rol})
                                </p>
                              )}
                              {entrega.comentario && (
                                <p className="mt-2 text-gray-700">
                                  <strong>Comentario:</strong> {entrega.comentario}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="ml-4">
                            <div
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                entrega.porcentaje_entregado === 100
                                  ? 'bg-green-100 text-green-700'
                                  : entrega.porcentaje_entregado >= 75
                                    ? 'bg-blue-100 text-blue-700'
                                    : entrega.porcentaje_entregado >= 50
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-orange-100 text-orange-700'
                              }`}
                            >
                              {entrega.porcentaje_entregado}%
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {solicitud.estado === 'pendiente' && onDonar && abrirEnModoDonacion && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 p-6 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center text-lg">
                <Package className="w-6 h-6 mr-2 text-green-600" />
                Gestionar Donación
              </h3>

              {!inventarioLoading && depositoSeleccionado !== '' && stockDepositoSeleccionado === 0 && (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <h4 className="font-bold text-red-900 mb-2">Sin Stock Disponible</h4>
                      <p className="text-sm text-red-800 mb-3">
                        La bodega seleccionada no tiene inventario disponible de &quot;{solicitud.tipo_alimento}&quot;. Selecciona otra bodega o rechaza la solicitud.
                      </p>
                      <button
                        type="button"
                        onClick={onRechazar}
                        className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <XCircle className="w-5 h-5" />
                        Rechazar Solicitud por Falta de Stock
                      </button>
                      <p className="text-xs text-red-700 italic mt-2">Al rechazar, se notificará automáticamente al solicitante con el motivo &quot;Sin stock disponible&quot;</p>
                    </div>
                  </div>
                </div>
              )}

              {!modoDonacion ? (
                <button
                  type="button"
                  onClick={() => setModoDonacion(true)}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  disabled={!depositoSeleccionado || stockDepositoSeleccionado === 0}
                >
                  {!depositoSeleccionado ? 'Selecciona una bodega para procesar' : stockDepositoSeleccionado === 0 ? 'Sin Stock en esta bodega' : 'Procesar Donación'}
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-lg border-2 border-green-300">
                    <h4 className="font-semibold text-gray-900 mb-3 text-sm">Resumen de la Solicitud</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Cantidad solicitada:</span>
                        <p className="font-semibold text-lg">
                          {solicitud.cantidad} {solicitud.unidades?.simbolo ?? 'unidades'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">Disponible en stock:</span>
                        <p className={`font-semibold text-lg ${maxDisponibleDeposito >= solicitud.cantidad ? 'text-green-600' : 'text-orange-600'}`}>
                          {formatQuantity(maxDisponibleDeposito)} {solicitud.unidades?.simbolo ?? 'unidades'}
                        </p>
                      </div>
                      {solicitud.cantidad_entregada && solicitud.cantidad_entregada > 0 && (
                        <>
                          <div>
                            <span className="text-gray-600">Ya entregado:</span>
                            <p className="font-semibold text-lg text-blue-600">
                              {solicitud.cantidad_entregada ?? 0} {solicitud.unidades?.simbolo ?? 'unidades'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-600">Pendiente de entregar:</span>
                            <p className="font-semibold text-lg text-orange-600">
                              {solicitud.cantidad - (solicitud.cantidad_entregada ?? 0)} {solicitud.unidades?.simbolo ?? 'unidades'}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="cantidad-donar" className="block text-sm font-medium text-gray-700 mb-2">
                      Cantidad a donar
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        id="cantidad-donar"
                        type="number"
                        min="0"
                        max={maxDisponibleDeposito}
                        step={permiteFraccion ? '0.01' : '1'}
                        value={cantidadDonar}
                        onChange={(e) => handleCantidadChange(e.target.value)}
                        aria-invalid={!cantidadUnidadValida}
                        aria-describedby={!cantidadUnidadValida ? 'cantidad-donar-error' : undefined}
                        className="flex-1 px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg font-semibold"
                        disabled={isProcessing}
                        placeholder="Ingrese cantidad"
                      />
                      <span className="text-gray-600 font-medium">{solicitud.unidades?.simbolo ?? 'unidades'}</span>
                    </div>
                    {!cantidadUnidadValida && (
                      <p id="cantidad-donar-error" role="alert" className="mt-1 text-xs text-red-700">
                        La unidad {solicitud.unidades?.nombre ?? solicitud.unidades?.simbolo ?? 'seleccionada'} no permite cantidades decimales. Ingresa una cantidad entera.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Comentarios (opcional)</label>
                    <textarea
                      value={comentarioDonacion}
                      onChange={(e) => setComentarioDonacion(e.target.value)}
                      rows={3}
                      placeholder="Ej: Entrega parcial por disponibilidad de stock..."
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      disabled={isProcessing}
                    />
                  </div>

                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={handleDonacionSubmit}
                      disabled={isProcessing || !cantidadUnidadValida || cantidadDonar <= 0 || cantidadDonar > maxDisponibleDeposito}
                      className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {isProcessing ? 'Procesando...' : `Confirmar Donación de ${cantidadDonar} ${solicitud.unidades?.simbolo ?? 'unidades'}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModoDonacion(false);
                        setCantidadDonar(Math.min(Math.max(0, solicitud.cantidad), maxDisponibleDeposito));
                        setComentarioDonacion('');
                      }}
                      disabled={isProcessing}
                      className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SolicitudDetailModal;
