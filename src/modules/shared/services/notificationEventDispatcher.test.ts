import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveUserProfile } from '@/lib/server-auth';
import {
  buildNotificationForEvent,
  NotificationDispatchError,
  parseNotificationEventPayload,
} from './notificationEventDispatcher';

vi.mock('@/lib/comprobante', async () => {
  const actual = await vi.importActual<typeof import('@/lib/comprobante')>('@/lib/comprobante');

  return {
    ...actual,
    generarQRBase64: vi.fn(async () => 'data:image/png;base64,qr'),
  };
});

vi.mock('@/lib/getBaseUrl', () => ({
  getBaseUrl: () => 'http://localhost:3000',
}));

interface QueryResponse {
  data: unknown;
  error: unknown;
}

const donorProfile: ActiveUserProfile = {
  id: 'donor-1',
  rol: 'DONANTE',
  estado: 'activo',
  nombre: 'Donante',
  email: 'donante@example.com',
};

const adminProfile: ActiveUserProfile = {
  id: 'admin-1',
  rol: 'ADMINISTRADOR',
  estado: 'activo',
  nombre: 'Admin',
  email: 'admin@example.com',
};

const operatorProfile: ActiveUserProfile = {
  id: 'operator-1',
  rol: 'OPERADOR',
  estado: 'activo',
  nombre: 'Operador',
  email: 'operador@example.com',
};

const createQuery = (response: QueryResponse) => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => response),
  };

  return query;
};

const createSupabase = (responses: Record<string, QueryResponse | QueryResponse[]>): SupabaseClient => {
  const from = vi.fn((table: string) => {
    const value = responses[table];
    const response = Array.isArray(value) ? value.shift() : value;

    if (!response) {
      throw new Error(`Unexpected table query: ${table}`);
    }

    return createQuery(response);
  });

  return { from } as unknown as SupabaseClient;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notification event payload parsing', () => {
  it('accepts only event and entityId', () => {
    expect(parseNotificationEventPayload({
      event: 'catalog_food_request_created',
      entityId: 'request-1',
    })).toEqual({
      success: true,
      payload: {
        event: 'catalog_food_request_created',
        entityId: 'request-1',
      },
    });
  });

  it('rejects sensitive fields', () => {
    expect(parseNotificationEventPayload({
      event: 'catalog_food_request_created',
      entityId: 'request-1',
      rolDestinatario: 'ADMINISTRADOR',
      email: { html: '<p>Libre</p>' },
    })).toEqual({
      success: false,
      error: 'Campos no permitidos: rolDestinatario, email.',
    });
  });
});

describe('buildNotificationForEvent', () => {
  it('allows a donor to notify admins about their own catalog request', async () => {
    const supabase = createSupabase({
      solicitudes_alta_alimentos: {
        data: {
          id: 'request-1',
          solicitante_id: 'donor-1',
          nombre: 'Quinua',
          categoria: 'Granos',
          estado: 'pendiente',
          comentario_admin: null,
        },
        error: null,
      },
    });

    const input = await buildNotificationForEvent(supabase, donorProfile, {
      event: 'catalog_food_request_created',
      entityId: 'request-1',
    });

    expect(input).toMatchObject({
      categoria: 'catalogo',
      rolDestinatario: 'ADMINISTRADOR',
      urlAccion: '/admin/catalogo',
      metadatos: {
        event: 'catalog_food_request_created',
        solicitudId: 'request-1',
        solicitanteId: 'donor-1',
      },
    });
  });

  it('rejects a donor catalog request notification for another owner', async () => {
    const supabase = createSupabase({
      solicitudes_alta_alimentos: {
        data: {
          id: 'request-2',
          solicitante_id: 'other-donor',
          nombre: 'Avena',
          categoria: 'Cereales',
          estado: 'pendiente',
          comentario_admin: null,
        },
        error: null,
      },
    });

    await expect(buildNotificationForEvent(supabase, donorProfile, {
      event: 'catalog_food_request_created',
      entityId: 'request-2',
    })).rejects.toMatchObject({
      status: 403,
      message: 'No puedes notificar una solicitud ajena.',
    });
  });

  it('builds a reviewed catalog notification for the donor owner', async () => {
    const supabase = createSupabase({
      solicitudes_alta_alimentos: {
        data: {
          id: 'request-1',
          solicitante_id: 'donor-1',
          nombre: 'Quinua',
          categoria: 'Granos',
          estado: 'aprobada',
          comentario_admin: null,
        },
        error: null,
      },
    });

    const input = await buildNotificationForEvent(supabase, adminProfile, {
      event: 'catalog_food_request_reviewed',
      entityId: 'request-1',
    });

    expect(input).toMatchObject({
      tipo: 'success',
      categoria: 'catalogo',
      destinatarioId: 'donor-1',
      urlAccion: '/donante/solicitar-alimento',
      metadatos: {
        event: 'catalog_food_request_reviewed',
        solicitudId: 'request-1',
        estado: 'aprobada',
      },
    });
  });

  it('builds a food request status notification for admin/operator roles', async () => {
    const supabase = createSupabase({
      solicitudes: {
        data: {
          id: 'food-request-1',
          usuario_id: 'recipient-1',
          tipo_alimento: 'Arroz',
          cantidad: 5,
          estado: 'rechazada',
          created_at: '2026-07-18T00:00:00.000Z',
          comentario_admin: 'Stock insuficiente',
          motivo_rechazo: 'stock_insuficiente',
          codigo_comprobante: null,
          cantidad_entregada: 0,
          tiene_entregas_parciales: false,
          usuarios: {
            nombre: 'Solicitante',
            cedula: '1234567890',
            telefono: '0999999999',
            email: 'solicitante@example.com',
            direccion: 'Direccion',
            tipo_persona: 'natural',
          },
          unidades: {
            id: 1,
            nombre: 'Kilogramo',
            simbolo: 'kg',
            tipo_magnitud_id: 1,
            es_base: true,
          },
        },
        error: null,
      },
    });

    const input = await buildNotificationForEvent(supabase, operatorProfile, {
      event: 'food_request_status_changed',
      entityId: 'food-request-1',
    });

    expect(input).toMatchObject({
      tipo: 'warning',
      categoria: 'solicitud',
      destinatarioId: 'recipient-1',
      urlAccion: '/user/formulario',
      metadatos: {
        event: 'food_request_status_changed',
        solicitudId: 'food-request-1',
        nuevoEstado: 'rechazada',
        motivoRechazo: 'stock_insuficiente',
      },
    });
    expect(input.email?.subject).toBe('Solicitud No Aprobada - Banco de Alimentos');
  });

  it('builds a donation status notification for admin/operator roles', async () => {
    const supabase = createSupabase({
      donaciones: {
        data: {
          id: 10,
          user_id: 'donor-1',
          nombre_donante: 'Donante',
          ruc_donante: null,
          cedula_donante: '1234567890',
          direccion_donante_completa: 'Direccion',
          telefono: '0999999999',
          email: 'donante@example.com',
          tipo_producto: 'Lenteja',
          cantidad: 12,
          unidad_simbolo: 'kg',
          estado: 'Aprobada',
          creado_en: '2026-07-18T00:00:00.000Z',
          codigo_comprobante: 'DON-TEST-123',
          motivo_cancelacion: null,
          observaciones_cancelacion: null,
        },
        error: null,
      },
    });

    const input = await buildNotificationForEvent(supabase, adminProfile, {
      event: 'donation_status_changed',
      entityId: '10',
    });

    expect(input).toMatchObject({
      tipo: 'success',
      categoria: 'donacion',
      destinatarioId: 'donor-1',
      urlAccion: '/donante/donaciones',
      metadatos: {
        event: 'donation_status_changed',
        donacionId: 10,
        nuevoEstado: 'Aprobada',
        codigoComprobante: 'DON-TEST-123',
      },
    });
    expect(input.email?.subject).toBe('Donación Confirmada - Código: DON-TEST-123');
  });

  it('rejects roles that are not allowed for an event before querying entities', async () => {
    const supabase = createSupabase({});

    await expect(buildNotificationForEvent(supabase, donorProfile, {
      event: 'donation_status_changed',
      entityId: '10',
    })).rejects.toBeInstanceOf(NotificationDispatchError);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
