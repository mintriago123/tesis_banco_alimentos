/**
 * @fileoverview Tipos para el historial de donaciones de una solicitud.
 * La lectura en sí vive en `../actions.ts` (`fetchHistorialDonacionesAction`) —
 * ya no hay un cliente Supabase que pasar aquí.
 */

export interface HistorialDonacion {
  id: string;
  solicitud_id: string;
  cantidad_entregada: number;
  porcentaje_entregado: number;
  cantidad_solicitada: number;
  operador_id: string | null;
  comentario: string | null;
  created_at: string;
  operador?: {
    nombre: string;
    rol: string;
  };
}
