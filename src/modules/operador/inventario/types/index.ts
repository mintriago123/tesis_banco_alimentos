/**
 * @fileoverview Tipos específicos para el módulo de inventario del operador.
 * Optimizado para las tareas específicas del rol operador.
 */

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export type StockLevelFilter = 'todos' | 'bajo' | 'normal' | 'alto';
export type StockLevel = Exclude<StockLevelFilter, 'todos'>;

export interface Deposito {
  id_deposito: string;
  nombre: string;
  descripcion: string | null;
}

export interface ProductoInventario {
  id_producto: string;
  nombre_producto: string;
  descripcion: string | null;
  unidad_id: number | null;
  unidad_nombre: string | null;
  unidad_simbolo: string | null;
  fecha_caducidad: string | null;
  fecha_donacion: string | null;
  dias_para_vencer?: number; // Calculado
  estado_caducidad?: 'vigente' | 'proximo' | 'vencido'; // Para operador
}

export interface InventarioItem {
  id_entrada: string;
  id_deposito: string;
  id_producto: string;
  cantidad_disponible: number;
  fecha_actualizacion: string | null;
  deposito: Deposito;
  producto: ProductoInventario;
  necesita_atencion?: boolean; // Para alertas del operador
  stock_status?: StockLevel; // Estado calculado
}

export interface AlertaInventario {
  tipo: 'stock_bajo' | 'proximo_vencer' | 'vencido';
  producto: ProductoInventario;
  cantidad_actual: number;
  deposito: Deposito;
  prioridad: 'alta' | 'media' | 'baja';
}

// Supabase related types
export type SupabaseDepositoRelation = {
  id_deposito?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
} | null;

export type SupabaseProductoRelation = {
  id_producto?: string | null;
  id_usuario?: string | null;
  nombre_producto?: string | null;
  descripcion?: string | null;
  unidad_id?: number | null;
  unidades?: {
    id?: number | null;
    nombre?: string | null;
    simbolo?: string | null;
  } | null;
} | null;

export interface SupabaseInventarioRow {
  id_entrada: string;
  id_deposito: string;
  id_producto: string;
  unidad_id: number | null;
  cantidad_disponible: number | null;
  fecha_ingreso: string | null;
  fecha_vencimiento: string | null;
  updated_at: string | null;
  depositos: SupabaseDepositoRelation | SupabaseDepositoRelation[];
  productos: SupabaseProductoRelation | SupabaseProductoRelation[]; // Alias usado en la consulta
}

export interface OperadorInventarioFilters {
  search: string;
  depositoId: string;
  stockLevel: StockLevelFilter;
  alertasOnly: boolean; // Filtro específico para operador
  proximosVencer: boolean; // Filtro específico para operador
}

export interface OperadorInventarioStats {
  totalProductos: number;
  stockBajo: number;
  stockNormal: number;
  stockAlto: number;
  totalUnidades: number;
  productosProximosVencer: number; // Específico para operador
  productosVencidos: number; // Específico para operador
  alertasActivas: number; // Específico para operador
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: unknown;
}
