/**
 * Pure stock-summary calculations, ported verbatim from the old
 * `inventoryStockService.ts`/`useInventoryStock.ts` — no DB access, safe to
 * run both server-side (in the Server Action) and reused for the
 * client-side compatibility-message helpers that don't need fresh data.
 */
import type { CantidadFormateada, ConversionData } from '@/lib/unidadConversion';
import { redondear, resolverConversionLocal } from '@/lib/unidadConversion';

export type StockStatus = 'sin_stock' | 'disponible' | 'stock_en_otra_unidad' | 'unidades_no_convertibles';

export interface StockInfo {
  id_entrada: string;
  id_deposito: string;
  cantidad_disponible: number;
  deposito: string;
  fecha_actualizacion: string | null;
  unidad_id?: number;
  unidad_nombre?: string;
  unidad_simbolo?: string;
  cantidad_formateada?: CantidadFormateada;
}

export interface StockUnitSummary {
  unidad_id: number;
  unidad_nombre?: string;
  unidad_simbolo?: string;
  cantidad_disponible: number;
  cantidad_formateada: CantidadFormateada;
  /** Se conserva para cálculos internos, pero no se muestra al solicitante. */
  depositos: StockInfo[];
}

export interface StockSummary {
  /** Es cero cuando no existe una unidad común calculable. */
  total_disponible: number;
  total_calculable: boolean;
  depositos: StockInfo[];
  unidades_disponibles: StockUnitSummary[];
  producto_encontrado: boolean;
  estado_stock: StockStatus;
  unidad_id?: number;
  unidad_nombre?: string;
  unidad_simbolo?: string;
  total_formateado?: CantidadFormateada;
}

export const emptySummary = (): StockSummary => ({
  total_disponible: 0,
  total_calculable: false,
  depositos: [],
  unidades_disponibles: [],
  producto_encontrado: false,
  estado_stock: 'sin_stock',
});

export const crearCantidadFormateada = (cantidad: number, simbolo: string, nombreUnidad: string): CantidadFormateada => ({
  cantidad: redondear(cantidad),
  simbolo,
  unidad_nombre: nombreUnidad,
  cantidad_original: cantidad,
  simbolo_original: simbolo,
  fue_convertido: false,
});

export const agruparStockPorUnidad = (saldos: StockInfo[]): StockUnitSummary[] => {
  const saldosPorUnidad = new Map<number, StockUnitSummary>();

  for (const saldo of saldos) {
    if (!saldo.unidad_id) continue;

    const existente = saldosPorUnidad.get(saldo.unidad_id);
    if (existente) {
      existente.cantidad_disponible += saldo.cantidad_disponible;
      existente.depositos.push(saldo);
      existente.cantidad_formateada = crearCantidadFormateada(existente.cantidad_disponible, existente.unidad_simbolo ?? '', existente.unidad_nombre ?? '');
      continue;
    }

    saldosPorUnidad.set(saldo.unidad_id, {
      unidad_id: saldo.unidad_id,
      unidad_nombre: saldo.unidad_nombre,
      unidad_simbolo: saldo.unidad_simbolo,
      cantidad_disponible: saldo.cantidad_disponible,
      cantidad_formateada: crearCantidadFormateada(saldo.cantidad_disponible, saldo.unidad_simbolo ?? '', saldo.unidad_nombre ?? ''),
      depositos: [saldo],
    });
  }

  return [...saldosPorUnidad.values()];
};

export const obtenerUnidadIdPorSimbolo = (simbolo: string, conversiones: ConversionData[]): number | undefined => {
  const conversion = conversiones.find((item) => item.simbolo_origen === simbolo || item.simbolo_destino === simbolo);

  if (!conversion) return undefined;
  return conversion.simbolo_origen === simbolo ? conversion.unidad_origen_id : conversion.unidad_destino_id;
};

export interface StockTotalResolution {
  calculable: boolean;
  cantidad: number;
}

export const calcularTotalPorUnidades = (
  saldos: Pick<StockInfo, 'cantidad_disponible' | 'unidad_id' | 'unidad_simbolo'>[],
  conversiones: ConversionData[],
): StockTotalResolution => {
  const unidadObjetivo = saldos[0];
  if (!unidadObjetivo?.unidad_id) {
    return { calculable: false, cantidad: 0 };
  }

  return saldos.reduce<StockTotalResolution>(
    (resultado, saldo) => {
      if (!resultado.calculable || !saldo.unidad_id) {
        return { calculable: false, cantidad: 0 };
      }

      const resolution = resolverConversionLocal(saldo.unidad_id, unidadObjetivo.unidad_id as number, conversiones);
      if (!resolution.convertible) {
        return { calculable: false, cantidad: 0 };
      }

      return { calculable: true, cantidad: resultado.cantidad + saldo.cantidad_disponible * resolution.factor };
    },
    { calculable: true, cantidad: 0 },
  );
};

type StockInfoForUnits = Pick<StockSummary, 'unidades_disponibles' | 'unidad_id' | 'unidad_nombre' | 'unidad_simbolo' | 'total_disponible' | 'depositos'>;

const obtenerUnidadesDisponibles = (stockInfo: StockInfoForUnits): StockUnitSummary[] => {
  if (stockInfo.unidades_disponibles.length > 0) {
    return stockInfo.unidades_disponibles;
  }

  if (!stockInfo.unidad_id) return [];

  return [
    {
      unidad_id: stockInfo.unidad_id,
      unidad_nombre: stockInfo.unidad_nombre,
      unidad_simbolo: stockInfo.unidad_simbolo,
      cantidad_disponible: stockInfo.total_disponible,
      cantidad_formateada: {
        cantidad: stockInfo.total_disponible,
        simbolo: stockInfo.unidad_simbolo ?? '',
        unidad_nombre: stockInfo.unidad_nombre ?? '',
        cantidad_original: stockInfo.total_disponible,
        simbolo_original: stockInfo.unidad_simbolo ?? '',
        fue_convertido: false,
      },
      depositos: stockInfo.depositos,
    },
  ];
};

export interface StockForRequestedUnit {
  cantidad_disponible: number;
  simbolo: string;
  unidad_nombre: string;
}

export const obtenerStockParaUnidad = (
  stockInfo: (Pick<StockSummary, 'producto_encontrado'> & StockInfoForUnits) | null,
  simboloUnidad: string,
  conversiones: ConversionData[],
): StockForRequestedUnit | null => {
  if (!stockInfo) return null;

  const unidadesDisponibles = obtenerUnidadesDisponibles(stockInfo);
  const simboloNormalizado = simboloUnidad.toLowerCase();
  const unidadSolicitadaId = unidadesDisponibles.find((unidad) => unidad.unidad_simbolo?.toLowerCase() === simboloNormalizado)?.unidad_id ?? obtenerUnidadIdPorSimbolo(simboloUnidad, conversiones);

  if (!unidadSolicitadaId) return null;

  let cantidadDisponible = 0;
  let simboloResultado = simboloUnidad;
  let nombreResultado = '';
  let encontroUnidadCompatible = false;

  for (const unidad of unidadesDisponibles) {
    if (unidad.unidad_simbolo?.toLowerCase() === simboloNormalizado) {
      cantidadDisponible += unidad.cantidad_disponible;
      simboloResultado = unidad.unidad_simbolo ?? simboloUnidad;
      nombreResultado = unidad.unidad_nombre ?? nombreResultado;
      encontroUnidadCompatible = true;
      continue;
    }

    const conversion = resolverConversionLocal(unidad.unidad_id, unidadSolicitadaId, conversiones);
    if (!conversion.convertible) continue;

    cantidadDisponible += unidad.cantidad_disponible * conversion.factor;
    encontroUnidadCompatible = true;
  }

  if (!encontroUnidadCompatible) return null;

  return { cantidad_disponible: cantidadDisponible, simbolo: simboloResultado, unidad_nombre: nombreResultado };
};

export const getUnitCompatibilityMessage = (
  stockInfo: (Pick<StockSummary, 'producto_encontrado'> & StockInfoForUnits) | null,
  conversiones: ConversionData[],
  simboloUnidad?: string,
): string | null => {
  if (!stockInfo?.producto_encontrado || !simboloUnidad) {
    return null;
  }

  const unidadesDisponibles = obtenerUnidadesDisponibles(stockInfo);
  if (unidadesDisponibles.some((unidad) => unidad.unidad_simbolo?.toLowerCase() === simboloUnidad.toLowerCase())) {
    return null;
  }

  const unidadSolicitadaId = obtenerUnidadIdPorSimbolo(simboloUnidad, conversiones);
  const compatible = unidadSolicitadaId && unidadesDisponibles.some((u) => resolverConversionLocal(u.unidad_id, unidadSolicitadaId, conversiones).convertible);

  if (!compatible) {
    const unidadesTexto = unidadesDisponibles.map((unidad) => unidad.unidad_simbolo || unidad.unidad_nombre || 'unidad').join(', ');
    return `No existe una conversión registrada de ${simboloUnidad} a las unidades disponibles (${unidadesTexto}).`;
  }

  return null;
};
