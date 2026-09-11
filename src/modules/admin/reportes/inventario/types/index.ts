export type { Deposito, InventarioItem } from '@/modules/operador/inventario/types';

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';
export type StockLevelFilter = 'todos' | 'bajo' | 'normal' | 'alto';
export type StockLevel = Exclude<StockLevelFilter, 'todos'>;

export interface InventarioFilters {
  search: string;
  depositoId: string;
  stockLevel: StockLevelFilter;
}

export interface InventarioStats {
  totalProductos: number;
  stockBajo: number;
  stockNormal: number;
  stockAlto: number;
  totalUnidades: number;
}
