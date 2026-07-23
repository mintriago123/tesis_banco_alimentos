/**
 * Contratos y utilidades para conversiones explícitas de unidades.
 *
 * La base de datos es la autoridad para operaciones de inventario. Las
 * funciones síncronas de este módulo solo sirven para previsualización y
 * presentación con un catálogo de conversiones ya cargado.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ConversionData {
  unidad_origen_id?: number;
  unidad_destino_id?: number;
  unidad_origen: string;
  simbolo_origen: string;
  unidad_destino: string;
  simbolo_destino: string;
  factor_conversion: number;
  activo?: boolean;
}

export type ConversionResolution =
  | {
      convertible: true;
      factor: number;
      origenId: number;
      destinoId: number;
      source: 'same_unit' | 'database';
    }
  | {
      convertible: false;
      reason: 'no_conversion' | 'incompatible_magnitude' | 'inactive_unit';
    };

type ConversionFailureReason = 'no_conversion' | 'incompatible_magnitude' | 'inactive_unit';

export type ConversionCalculation =
  | {
      success: true;
      cantidad: number;
      factor: number;
      resolution: Extract<ConversionResolution, { convertible: true }>;
    }
  | {
      success: false;
      reason: ConversionFailureReason | 'invalid_quantity';
    };

export interface CantidadFormateada {
  cantidad: number;
  simbolo: string;
  unidad_nombre: string;
  cantidad_original: number;
  simbolo_original: string;
  fue_convertido: boolean;
}

const isFinitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;

const isFiniteNonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

export type UnitQuantityValidation =
  | { valid: true }
  | { valid: false; error: string };

export const validarCantidadParaUnidad = (
  cantidad: number,
  unidad: { nombre?: string | null; es_discreta?: boolean | null; permite_fraccion?: boolean | null },
): UnitQuantityValidation => {
  if (!isFinitePositive(cantidad)) {
    return { valid: false, error: 'La cantidad debe ser un número finito mayor que cero.' };
  }

  if (
    unidad.es_discreta &&
    unidad.permite_fraccion === false &&
    !Number.isInteger(cantidad)
  ) {
    return {
      valid: false,
      error: `La unidad ${unidad.nombre ?? 'seleccionada'} no permite cantidades decimales.`,
    };
  }

  return { valid: true };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const isResolution = (value: unknown): value is ConversionResolution => {
  if (!isRecord(value) || typeof value.convertible !== 'boolean') {
    return false;
  }

  if (value.convertible) {
    return (
      isFinitePositive(Number(value.factor)) &&
      isPositiveInteger(value.origenId) &&
      isPositiveInteger(value.destinoId) &&
      (value.source === 'same_unit' || value.source === 'database')
    );
  }

  return (
    value.reason === 'no_conversion' ||
    value.reason === 'incompatible_magnitude' ||
    value.reason === 'inactive_unit'
  );
};

const noConversion = (): ConversionResolution => ({
  convertible: false,
  reason: 'no_conversion',
});

/**
 * Resuelve una conversión desde un catálogo cargado previamente.
 * Nunca infiere equivalencias por compartir tipo de magnitud.
 */
export const resolverConversionLocal = (
  unidadOrigenId: number,
  unidadDestinoId: number,
  conversiones: ConversionData[],
): ConversionResolution => {
  if (!isPositiveInteger(unidadOrigenId) || !isPositiveInteger(unidadDestinoId)) {
    return noConversion();
  }

  if (unidadOrigenId === unidadDestinoId) {
    return {
      convertible: true,
      factor: 1,
      origenId: unidadOrigenId,
      destinoId: unidadDestinoId,
      source: 'same_unit',
    };
  }

  const conversion = conversiones.find(item => {
    const coincidePorId =
      item.unidad_origen_id === unidadOrigenId && item.unidad_destino_id === unidadDestinoId;
    return coincidePorId;
  });

  if (conversion && conversion.activo !== false && isFinitePositive(conversion.factor_conversion)) {
    return {
      convertible: true,
      factor: conversion.factor_conversion,
      origenId: unidadOrigenId,
      destinoId: unidadDestinoId,
      source: 'database',
    };
  }

  const inverse = conversiones.find(item => {
    const coincidePorId =
      item.unidad_origen_id === unidadDestinoId && item.unidad_destino_id === unidadOrigenId;
    return coincidePorId;
  });

  if (inverse && inverse.activo !== false && isFinitePositive(inverse.factor_conversion)) {
    return {
      convertible: true,
      factor: 1 / inverse.factor_conversion,
      origenId: unidadOrigenId,
      destinoId: unidadDestinoId,
      source: 'database',
    };
  }

  return noConversion();
};

/**
 * Resuelve definitivamente usando la RPC central de Supabase.
 */
export const resolverConversion = async (
  supabaseClient: SupabaseClient,
  unidadOrigenId: number,
  unidadDestinoId: number,
): Promise<ConversionResolution> => {
  if (!isPositiveInteger(unidadOrigenId) || !isPositiveInteger(unidadDestinoId)) {
    return noConversion();
  }

  const { data, error } = await supabaseClient.rpc('resolver_conversion', {
    unidad_origen_id: unidadOrigenId,
    unidad_destino_id: unidadDestinoId,
  });

  if (error || !isResolution(data)) {
    return noConversion();
  }

  return data;
};

/**
 * Convierte una cantidad usando una resolución explícita.
 */
export const aplicarConversion = (
  cantidad: number,
  resolution: ConversionResolution,
): ConversionCalculation => {
  if (!isFiniteNonNegative(cantidad)) {
    return { success: false, reason: 'invalid_quantity' };
  }

  if (!resolution.convertible) {
    return { success: false, reason: resolution.reason };
  }

  const resultado = cantidad * resolution.factor;
  if (!isFiniteNonNegative(resultado)) {
    return { success: false, reason: 'invalid_quantity' };
  }

  return {
    success: true,
    cantidad: resultado,
    factor: resolution.factor,
    resolution,
  };
};

/**
 * Redondea exclusivamente para presentación.
 */
export const redondear = (num: number, decimales = 2): number => {
  if (!Number.isFinite(num)) {
    throw new RangeError('La cantidad debe ser un número finito');
  }

  if (!Number.isInteger(decimales) || decimales < 0 || decimales > 10) {
    throw new RangeError('El número de decimales no es válido');
  }

  if (Number.isInteger(num)) return num;

  const factor = 10 ** decimales;
  const redondeado = Math.round(num * factor) / factor;
  return Object.is(redondeado, -0) ? 0 : redondeado;
};

/**
 * Formatea un número para mostrar sin modificar el valor usado en inventario.
 */
export const formatearNumero = (num: number, decimales = 2): string => {
  const redondeado = redondear(num, decimales);

  if (redondeado >= 10000) {
    return redondeado.toLocaleString('es-EC', {
      maximumFractionDigits: decimales,
    });
  }

  return redondeado.toString();
};

/**
 * Mantiene el wrapper histórico para consumidores visuales. La presentación
 * ya no cambia de unidad automáticamente: la unidad recibida es la unidad
 * que se muestra.
 */
export const convertirCantidad = (
  cantidad: number,
  simboloActual: string,
  nombreUnidadActual: string,
  _conversiones: ConversionData[] = [],
): CantidadFormateada => {
  // El parámetro se conserva para compatibilidad con consumidores existentes.
  // La presentación no debe aplicar conversiones implícitas.
  void _conversiones;

  return {
    cantidad: redondear(cantidad),
    simbolo: simboloActual,
    unidad_nombre: nombreUnidadActual,
    cantidad_original: cantidad,
    simbolo_original: simboloActual,
    fue_convertido: false,
  };
};

/**
 * Wrapper compatible para previsualización basada en símbolos.
 */
export const convertirEntreUnidades = (
  cantidad: number,
  simboloOrigen: string,
  simboloDestino: string,
  conversiones: ConversionData[],
): ConversionCalculation => {
  const unidadIdPorSimbolo = (simbolo: string): number | undefined => {
    const conversion = conversiones.find(item => item.simbolo_origen === simbolo);
    if (conversion) return conversion.unidad_origen_id;

    return conversiones.find(item => item.simbolo_destino === simbolo)?.unidad_destino_id;
  };

  const origenId = unidadIdPorSimbolo(simboloOrigen);
  const destinoId = unidadIdPorSimbolo(simboloDestino);

  if (!origenId || !destinoId) {
    return aplicarConversion(cantidad, { convertible: false, reason: 'no_conversion' });
  }

  const resolution = resolverConversionLocal(
    origenId,
    destinoId,
    conversiones,
  );

  return aplicarConversion(cantidad, resolution);
};
