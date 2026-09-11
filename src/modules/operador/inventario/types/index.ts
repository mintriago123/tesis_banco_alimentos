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
  categoria: string | null;
  unidad_id: number | null;
  unidad_nombre: string | null;
  unidad_simbolo: string | null;
  fecha_caducidad: string | null;
  fecha_donacion: string | null;
  dias_para_vencer?: number;
  estado_caducidad?: 'vigente' | 'proximo' | 'vencido';
}

export interface InventarioItem {
  id_entrada: string;
  id_deposito: string;
  id_producto: string;
  cantidad_disponible: number;
  fecha_actualizacion: string | null;
  deposito: Deposito;
  producto: ProductoInventario;
  necesita_atencion?: boolean;
  stock_status?: StockLevel;
}

export interface AlertaInventario {
  tipo: 'stock_bajo' | 'proximo_vencer' | 'vencido';
  producto: ProductoInventario;
  cantidad_actual: number;
  deposito: Deposito;
  prioridad: 'alta' | 'media' | 'baja';
}

export interface OperadorInventarioFilters {
  search: string;
  depositoId: string;
  stockLevel: StockLevelFilter;
  alertasOnly: boolean;
  proximosVencer: boolean;
}

export interface OperadorInventarioStats {
  totalProductos: number;
  stockBajo: number;
  stockNormal: number;
  stockAlto: number;
  totalUnidades: number;
  productosProximosVencer: number;
  productosVencidos: number;
  alertasActivas: number;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: unknown;
}
