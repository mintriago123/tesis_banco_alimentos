import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AlimentosService } from './alimentosService';

const alimentosConStock = [
  { id: 2, nombre: 'Arroz', categoria: 'Granos' },
  { id: 3, nombre: 'Atún', categoria: 'Enlatados' },
  { id: 4, nombre: 'Lentejas', categoria: 'Granos' },
];

const createSupabase = (
  data: unknown,
  error: { message: string; code?: string } | null = null,
) => {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const supabase = { rpc } as unknown as SupabaseClient;

  return { supabase, rpc };
};

describe('AlimentosService', () => {
  it('obtiene alimentos con stock mediante el RPC seguro para solicitantes', async () => {
    const { supabase, rpc } = createSupabase(alimentosConStock);
    const service = new AlimentosService(supabase);

    const result = await service.getAlimentosConStock();

    expect(result).toEqual({ data: alimentosConStock, error: null });
    expect(rpc).toHaveBeenCalledWith('obtener_alimentos_con_stock');
  });

  it('deriva categorías desde el mismo listado de stock', async () => {
    const { supabase, rpc } = createSupabase(alimentosConStock);
    const service = new AlimentosService(supabase);

    const result = await service.getCategoriasConStock();

    expect(result).toEqual({ data: ['Enlatados', 'Granos'], error: null });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('propaga el error del RPC de stock', async () => {
    const rpcError = { message: 'permission denied', code: '42501' };
    const { supabase } = createSupabase(null, rpcError);
    const service = new AlimentosService(supabase);

    const result = await service.getAlimentosConStock();

    expect(result).toEqual({ data: [], error: rpcError });
  });
});
