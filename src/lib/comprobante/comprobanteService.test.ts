import QRCode from 'qrcode';
import { describe, expect, it, vi } from 'vitest';
import {
  decodificarQRPayload,
  formatearFecha,
  formatearFechaSolo,
  generarCodigoComprobante,
  generarDatosComprobante,
  generarQRBase64,
  generarURLComprobante,
} from './comprobanteService';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn() },
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';

const usuario = {
  id: USER_ID,
  nombre: 'Usuario de prueba',
  email: 'user@example.com',
  telefono: '0999999999',
};

const pedido = {
  id: 'pedido-1',
  tipo: 'solicitud' as const,
  tipoAlimento: 'Arroz',
  cantidad: 5,
  unidad: 'kg',
  estado: 'aprobada',
  fechaCreacion: '2026-07-20T00:00:00.000Z',
};

describe('comprobanteService', () => {
  it('generates readable codes for requests and donations', () => {
    expect(generarCodigoComprobante('solicitud', '1')).toMatch(/^SOL-[A-Z0-9]+-[A-F0-9]{6}$/);
    expect(generarCodigoComprobante('donacion', '2')).toMatch(/^DON-[A-Z0-9]+-[A-F0-9]{6}$/);
  });

  it('generates and validates a URL-safe QR payload', () => {
    const url = generarURLComprobante(
      'https://app.example.test',
      'SOL-ABC-123',
      'solicitud',
      USER_ID,
      pedido.id,
    );
    const encoded = url.split('/').pop() ?? '';
    const payload = decodificarQRPayload(encoded);

    expect(url).toContain('/comprobante/');
    expect(encoded).not.toMatch(/[+/=]/);
    expect(payload).toMatchObject({
      c: 'SOL-ABC-123',
      t: 'S',
      u: USER_ID,
      p: pedido.id,
    });
  });

  it('rejects a QR payload with a corrupt checksum or invalid JSON', () => {
    const payload = {
      c: 'DON-ABC-123',
      t: 'D',
      u: USER_ID,
      p: '10',
      f: String(Date.now()),
      v: '00000000',
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');

    expect(decodificarQRPayload(encoded)).toBeNull();
    expect(decodificarQRPayload('not-json')).toBeNull();
  });

  it('generates a QR image and wraps generation failures with a safe message', async () => {
    vi.mocked(QRCode.toDataURL).mockImplementationOnce(
      (() => Promise.resolve('data:image/png;base64,test')) as never,
    );
    await expect(generarQRBase64('https://app.example.test/comprobante/1'))
      .resolves.toBe('data:image/png;base64,test');

    vi.mocked(QRCode.toDataURL).mockImplementationOnce(
      (() => Promise.reject(new Error('renderer failed'))) as never,
    );
    await expect(generarQRBase64('https://app.example.test/comprobante/2'))
      .rejects.toThrow('No se pudo generar el código QR');
  });

  it('creates request and donation instructions with their own data', () => {
    const solicitud = generarDatosComprobante('solicitud', usuario, pedido, 'Aprobado');
    const donacion = generarDatosComprobante('donacion', usuario, {
      ...pedido,
      id: 'donacion-1',
      tipo: 'donacion',
      estado: 'Aprobada',
    });

    expect(solicitud.pedido.comentarioAdmin).toBe('Aprobado');
    expect(solicitud.instrucciones).toHaveLength(5);
    expect(solicitud.instrucciones[0]).toContain('retirar');
    expect(donacion.instrucciones).toHaveLength(5);
    expect(donacion.instrucciones[0]).toContain('constancia');
    expect(new Date(donacion.fechaVencimiento).getTime())
      .toBeGreaterThan(new Date(donacion.fechaEmision).getTime());
  });

  it('formats full and date-only ISO values for the receipt', () => {
    expect(formatearFecha('2026-07-20T15:30:00.000Z')).toContain('2026');
    expect(formatearFechaSolo('2026-07-20T15:30:00.000Z')).toContain('2026');
  });
});
