// ============================================================================
// Service: Alimentos
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Alimento } from '../types';
import { parsePositiveIntegerValue } from '@/lib/validation-core';

const isDevelopment = process.env.NODE_ENV === 'development';

export class AlimentosService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Obtener todos los alimentos disponibles
   */
  async getAlimentos(): Promise<{ data: Alimento[] | null; error: unknown }> {
    try {
      const { data, error } = await this.supabase
        .from('alimentos')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) {
        console.error('Error fetching alimentos:', error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error('Exception fetching alimentos:', error);
      return { data: null, error };
    }
  }

  /**
   * Obtener un alimento por ID
   */
  async getAlimentoById(
    alimentoId: number
  ): Promise<{ data: Alimento | null; error: unknown }> {
    try {
      const parsedAlimentoId = parsePositiveIntegerValue(alimentoId, {
        name: 'alimentoId',
        min: 1,
      });
      if (!parsedAlimentoId.success) {
        return { data: null, error: parsedAlimentoId.error };
      }

      const { data, error } = await this.supabase
        .from('alimentos')
        .select('id, nombre, categoria, descripcion')
        .eq('id', parsedAlimentoId.value)
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Obtener categorías únicas de alimentos
   */
  async getCategorias(): Promise<{ data: string[] | null; error: unknown }> {
    try {
      const { data, error } = await this.supabase
        .from('alimentos')
        .select('categoria');

      if (error || !data) {
        return { data: null, error };
      }

      const categorias = [...new Set(data.map((item) => item.categoria))].sort();
      return { data: categorias, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Obtener categorías únicas solo de productos con stock disponible
   */
  async getCategoriasConStock(): Promise<{ data: string[] | null; error: unknown }> {
    try {
      const { data, error } = await this.getAlimentosConStock();
      if (error) return { data: [], error };

      const categorias = [
        ...new Set((data ?? []).map((alimento) => alimento.categoria).filter(Boolean)),
      ].sort();
      if (isDevelopment) {
        console.log('Categorías con stock:', categorias);
      }

      return { data: categorias, error: null };
    } catch (error) {
      console.error('Exception in getCategoriasConStock:', error);
      return { data: null, error };
    }
  }

  /**
   * Obtener alimentos que tienen stock disponible
   */
  async getAlimentosConStock(): Promise<{ data: Alimento[] | null; error: unknown }> {
    try {
      const { data, error } = await this.supabase.rpc('obtener_alimentos_con_stock');

      if (error) {
        console.error('Error fetching alimentos con stock:', error);
        return { data: [], error };
      }

      if (!data || data.length === 0) {
        if (isDevelopment) {
          console.log('No hay alimentos con stock disponible');
        }
        return { data: [], error: null };
      }

      const alimentosData = data as Alimento[];
      return { data: alimentosData, error: null };
    } catch (error) {
      console.error('Exception in getAlimentosConStock:', error);
      return { data: null, error };
    }
  }
}
