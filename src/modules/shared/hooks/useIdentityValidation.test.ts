import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIdentityValidation } from './useIdentityValidation';

const VALID_CEDULA = '1710034065';
const VALID_RUC = '1710034065001';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIdentityValidation', () => {
  it('rejects invalid identity numbers without making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useIdentityValidation());

    await act(async () => {
      await expect(result.current.consultarCedula('123')).resolves.toBeNull();
      await expect(result.current.consultarRuc('123')).resolves.toBeNull();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.validacionDocumento.mensaje).toBe('El RUC ingresado no es válido.');
  });

  it('extracts a valid natural-person response and keeps valid dates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      paquete: {
        entidades: {
          entidad: [{
            filas: {
              fila: [{
                columnas: {
                  columna: [
                    { campo: 'nombre', valor: 'Persona Natural' },
                    { campo: 'cedula', valor: VALID_CEDULA },
                    { campo: 'fecha_expedicion', valor: '2020-01-01' },
                    { campo: 'fechaExpiracion', valor: '2030-01-01' },
                  ],
                },
              }],
            },
          }],
        },
      },
    }), { status: 200 })));
    const { result } = renderHook(() => useIdentityValidation());

    let data: unknown;
    await act(async () => {
      data = await result.current.consultarCedula(VALID_CEDULA);
    });

    expect(data).toEqual({
      nombre: 'Persona Natural',
      cedula: VALID_CEDULA,
      fechasValidas: ['2020-01-01', '2030-01-01'],
    });
    expect(result.current.fechasValidasNatural).toEqual(['2020-01-01', '2030-01-01']);
    expect(result.current.consultando).toBe(false);
    expect(result.current.validacionDocumento.mensaje).toContain('fecha de emisión');
  });

  it('falls back to manual entry for incomplete or failed cedula responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ paquete: {} }), { status: 200 }))
      .mockRejectedValueOnce(new Error('network failed'));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useIdentityValidation());

    await act(async () => {
      await expect(result.current.consultarCedula(VALID_CEDULA)).resolves.toBeNull();
    });
    expect(result.current.validacionDocumento.mensaje).toBe('Puedes ingresar los datos manualmente.');
    expect(result.current.fechasValidasNatural).toEqual([]);

    await act(async () => {
      await expect(result.current.consultarCedula(VALID_CEDULA)).resolves.toBeNull();
    });
    expect(result.current.validacionDocumento.mensaje).toBe('No se pudo consultar la identificación.');
    expect(result.current.consultando).toBe(false);
  });

  it('extracts RUC details and handles unsuccessful RUC responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        'Servicio 5383': {
          'Razon Social': 'Empresa de prueba',
          'Descripcion Ubicacion Geo': 'Quito',
        },
        'Servicio 5387': {
          'Nombre Repre Legal': 'Representante',
          'Datos Representante Legal': {
            Cedula: VALID_CEDULA,
            'Fecha Expedicion': '2019-01-01',
            'Fecha Expiracion': '2029-01-01',
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        'Servicio 5383': {},
      }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useIdentityValidation());

    await act(async () => {
      await expect(result.current.consultarRuc(VALID_RUC)).resolves.toEqual({
        nombre: 'Empresa de prueba',
        direccion: 'Quito',
        representante: 'Representante',
        fechasValidas: ['2019-01-01', '2029-01-01'],
      });
    });
    expect(result.current.fechasValidasJuridica).toEqual(['2019-01-01', '2029-01-01']);

    await act(async () => {
      await expect(result.current.consultarRuc(VALID_RUC)).resolves.toBeNull();
    });
    expect(result.current.validacionDocumento.mensaje).toBe('Puedes ingresar los datos manualmente.');
    expect(result.current.fechasValidasJuridica).toEqual([]);
  });

  it('exposes loading state and resets all validation state', async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    })));
    const { result } = renderHook(() => useIdentityValidation());

    let request: Promise<unknown> | undefined;
    act(() => {
      request = result.current.consultarRuc(VALID_RUC);
    });
    await waitFor(() => expect(result.current.consultando).toBe(true));

    resolveFetch?.(new Response(JSON.stringify({
      'Servicio 5383': { 'Razon Social': 'Empresa' },
    }), { status: 200 }));
    await act(async () => {
      await request;
    });
    expect(result.current.consultando).toBe(false);

    act(() => result.current.resetValidation());
    expect(result.current.validacionDocumento).toEqual({ esValido: false, mensaje: null });
    expect(result.current.fechasValidasNatural).toEqual([]);
    expect(result.current.fechasValidasJuridica).toEqual([]);
  });
});
