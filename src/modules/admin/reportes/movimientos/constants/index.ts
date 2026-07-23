/**
 * @fileoverview Constantes y configuraciones para el sistema de reportes de movimientos
 * Este archivo centraliza todas las constantes, configuraciones de tema, etiquetas
 * y valores predeterminados utilizados en el módulo de reportes.
 * 
 * @author Sistema de Banco de Alimentos
 * @version 1.0.0
 */

import type { 
  ReportFilters, 
  MovementType
} from '../types';

/**
 * Encabezados para exportación de reportes Excel
 * Orden y nombres de las columnas en el archivo exportado
 */
export const EXPORT_HEADERS = [
  'Fecha',
  'Tipo',
  'Producto', 
  'Unidad',
  'Cantidad',
  'Usuario',
  'Origen',
  'Observaciones'
] as const;

/**
 * Anchos de columna para archivos Excel (en caracteres)
 * Corresponde a cada encabezado en EXPORT_HEADERS
 */
export const EXPORT_COLUMN_WIDTHS = [22, 14, 32, 12, 12, 30, 28, 48] as const;

/**
 * Filtros iniciales por defecto para reportes
 * Estado limpio sin filtros aplicados
 */
export const INITIAL_FILTERS: ReportFilters = {
  fecha_inicio: '',
  fecha_fin: '',
  tipo_movimiento: undefined,
  producto: ''
} as const;

/**
 * Etiquetas legibles para tipos de movimiento
 * Mapeo de valores técnicos a texto amigable para el usuario
 */
export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso'
} as const;

/**
 * Clases CSS para badges de tipos de movimiento
 * Estilos Tailwind para identificación visual rápida
 */
export const MOVEMENT_BADGE_STYLES: Record<MovementType, string> = {
  ingreso: 'bg-green-100 text-green-800 border-green-200',
  egreso: 'bg-red-100 text-red-800 border-red-200'
} as const;

/**
 * Roles de usuario válidos en el sistema
 * Lista completa de roles permitidos
 */
/**
 * Configuración de localización para formato de números y fechas
 */
export const LOCALE_CONFIG = {
  /** Configuración regional para España */
  locale: 'es-ES',
  
  /** Opciones de formato para números */
  numberFormat: {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  },
} as const;

/**
 * Mensajes de estado y errores del sistema
 */
export const SYSTEM_MESSAGES = {
  // Estados sin datos
  noData: 'No hay movimientos',
  noFilteredData: 'No se encontraron movimientos con los filtros aplicados'
} as const;

/**
 * Configuración de nombres de archivos de exportación
 */
export const EXPORT_CONFIG = {
  /** Prefijo para archivos de reporte */
  filePrefix: 'reporte_movimientos_',
  
  /** Extensión de archivo */
  fileExtension: '.xlsx',
  
  /** Nombre de la hoja de trabajo */
  worksheetName: 'Movimientos',
} as const;

/**
 * Configuración de altura de filas para Excel (en puntos)
 */
export const EXCEL_ROW_HEIGHTS = {
  default: 20
} as const;

/**
 * Valores por defecto para datos faltantes
 */
export const DEFAULT_VALUES = {
  unknownUser: 'Usuario desconocido',
  unknownProduct: 'Producto sin nombre',
  defaultUnit: 'unidad',
  noObservations: 'Sin observaciones',
  emptyDate: '—',
  fallbackQuantity: 0
} as const;
