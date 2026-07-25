import { act, renderHook } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfileUpdate } from './useProfileUpdate';

type QueryResponse = { data?: unknown; error?: { message: string } | null };

const createSupabaseMock = (responses: {
  duplicate?: QueryResponse;
  profile?: QueryResponse;
  update?: QueryResponse;
  rpc?: QueryResponse;
  throwOn?: 'profile' | 'update' | 'rpc';
}) => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => responses.duplicate ?? { data: null, error: null }),
    single: vi.fn(async () => {
      if (responses.throwOn === 'profile') throw new Error('profile query failed');
      return responses.profile ?? { data: null, error: null };
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn(async () => {
        if (responses.throwOn === 'update') throw new Error('update failed');
        return responses.update ?? { error: null };
      }),
    }),
  };
  const from = vi.fn((table: string) => {
    if (table !== 'usuarios') throw new Error(`Unexpected table: ${table}`);
    return query;
  });
  const rpc = vi.fn(async () => {
    if (responses.throwOn === 'rpc') throw new Error('rpc failed');
    return responses.rpc ?? { error: null };
  });

  return {
    supabase: { from, rpc } as unknown as SupabaseClient,
    rpc,
  };
};

const profile = {
  tipo_persona: 'Natural',
  cedula: '1710034065',
  ruc: null,
  nombre: 'Usuario de prueba',
  direccion: 'Quito',
  telefono: '0999999999',
};

describe('useProfileUpdate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('detects duplicate cedulas and RUCs, and allows unique values', async () => {
    const duplicate = createSupabaseMock({ duplicate: { data: { id: 'other' }, error: null } });
    const { result } = renderHook(() => useProfileUpdate(duplicate.supabase));

    await act(async () => {
      await expect(result.current.checkDuplicateIdentification('Natural', '1710034065', 'current'))
        .resolves.toBe(true);
    });
    expect(result.current.error).toContain('cédula');

    const unique = createSupabaseMock({ duplicate: { data: null, error: null } });
    const uniqueHook = renderHook(() => useProfileUpdate(unique.supabase));
    await act(async () => {
      await expect(uniqueHook.result.current.checkDuplicateIdentification('Juridica', '1799999999001', 'current'))
        .resolves.toBe(false);
    });
    expect(uniqueHook.result.current.error).toBeNull();
  });

  it('loads a profile and exposes database and exception errors', async () => {
    const successful = createSupabaseMock({ profile: { data: profile, error: null } });
    const { result } = renderHook(() => useProfileUpdate(successful.supabase));
    await act(async () => {
      await expect(result.current.loadUserProfile('user-1')).resolves.toEqual(profile);
    });
    expect(result.current.loading).toBe(false);

    const databaseError = createSupabaseMock({ profile: { data: null, error: { message: 'not found' } } });
    const databaseHook = renderHook(() => useProfileUpdate(databaseError.supabase));
    await act(async () => {
      await expect(databaseHook.result.current.loadUserProfile('user-1')).resolves.toBeNull();
    });
    expect(databaseHook.result.current.error).toBe('No se pudieron cargar los datos del perfil.');

    const exception = createSupabaseMock({ throwOn: 'profile' });
    const exceptionHook = renderHook(() => useProfileUpdate(exception.supabase));
    await act(async () => {
      await expect(exceptionHook.result.current.loadUserProfile('user-1')).resolves.toBeNull();
    });
    expect(exceptionHook.result.current.error).toBe('Error al cargar el perfil.');
  });

  it('updates and saves profiles with success and Supabase errors', async () => {
    const successful = createSupabaseMock({ update: { error: null } });
    const { result } = renderHook(() => useProfileUpdate(successful.supabase));

    await act(async () => {
      await expect(result.current.updateProfile('user-1', { nombre: 'Nuevo nombre' })).resolves.toBe(true);
      await expect(result.current.saveProfile('user-1', { telefono: '0988888888' })).resolves.toBe(true);
    });
    expect(result.current.success).toContain('guardado');

    const failed = createSupabaseMock({ update: { error: { message: 'constraint failed' } } });
    const failedHook = renderHook(() => useProfileUpdate(failed.supabase));
    await act(async () => {
      await expect(failedHook.result.current.updateProfile('user-1', {})).resolves.toBe(false);
      await expect(failedHook.result.current.saveProfile('user-1', {})).resolves.toBe(false);
    });
    expect(failedHook.result.current.error).toContain('constraint failed');

    const exception = createSupabaseMock({ throwOn: 'update' });
    const exceptionHook = renderHook(() => useProfileUpdate(exception.supabase));
    await act(async () => {
      await expect(exceptionHook.result.current.updateProfile('user-1', {})).resolves.toBe(false);
      await expect(exceptionHook.result.current.saveProfile('user-1', {})).resolves.toBe(false);
    });
    expect(exceptionHook.result.current.error).toContain('Error al guardar');
  });

  it('creates the primary donor warehouse and handles RPC failures', async () => {
    const successful = createSupabaseMock({ rpc: { error: null } });
    const { result } = renderHook(() => useProfileUpdate(successful.supabase));
    await act(async () => {
      await expect(result.current.ensureDonorWarehouse()).resolves.toBe(true);
    });
    expect(successful.rpc).toHaveBeenCalledWith('crear_bodega_principal_donante');

    const failed = createSupabaseMock({ rpc: { error: { message: 'permission denied' } } });
    const failedHook = renderHook(() => useProfileUpdate(failed.supabase));
    await act(async () => {
      await expect(failedHook.result.current.ensureDonorWarehouse()).resolves.toBe(false);
    });
    expect(failedHook.result.current.error).toContain('permission denied');

    const exception = createSupabaseMock({ throwOn: 'rpc' });
    const exceptionHook = renderHook(() => useProfileUpdate(exception.supabase));
    await act(async () => {
      await expect(exceptionHook.result.current.ensureDonorWarehouse()).resolves.toBe(false);
    });
    expect(exceptionHook.result.current.error).toBe('Error al crear la bodega principal.');
  });

  it('clears transient messages', async () => {
    const mock = createSupabaseMock({ update: { error: { message: 'failure' } } });
    const { result } = renderHook(() => useProfileUpdate(mock.supabase));

    await act(async () => {
      await result.current.updateProfile('user-1', {});
    });
    expect(result.current.error).not.toBeNull();
    act(() => result.current.clearMessages());
    expect(result.current.error).toBeNull();
    expect(result.current.success).toBeNull();
  });
});
