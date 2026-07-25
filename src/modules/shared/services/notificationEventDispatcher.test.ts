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

const DONOR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_DONOR_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const OPERATOR_ID = '44444444-4444-4444-8444-444444444444';
const CATALOG_REQUEST_ID = '55555555-5555-4555-8555-555555555555';
const CATALOG_REQUEST_2_ID = '66666666-6666-4666-8666-666666666666';
const FOOD_REQUEST_ID = '77777777-7777-4777-8777-777777777777';
const RECIPIENT_ID = '88888888-8888-4888-8888-888888888888';

const donorProfile: ActiveUserProfile = {
  id: DONOR_ID,
  rol: 'DONANTE',
  estado: 'activo',
  nombre: 'Donante',
  email: 'donante@example.com',
};

const adminProfile: ActiveUserProfile = {
  id: ADMIN_ID,
  rol: 'ADMINISTRADOR',
  estado: 'activo',
  nombre: 'Admin',
  email: 'admin@example.com',
};

const operatorProfile: ActiveUserProfile = {
  id: OPERATOR_ID,
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
      entityId: CATALOG_REQUEST_ID,
    })).toEqual({
      success: true,
      payload: {
        event: 'catalog_food_request_created',
        entityId: CATALOG_REQUEST_ID,
      },
    });
  });

  it('rejects sensitive fields', () => {
    expect(parseNotificationEventPayload({
      event: 'catalog_food_request_created',
      entityId: CATALOG_REQUEST_ID,
      rolDestinatario: 'ADMINISTRADOR',
      email: { html: '<p>Libre</p>' },
    })).toEqual({
      success: false,
      error: 'Campos no permitidos: rolDestinatario, email.',
    });
  });

  it('rejects entity IDs that do not match the event contract', () => {
    expect(parseNotificationEventPayload({
      event: 'catalog_food_request_created',
      entityId: 'request-1',
    })).toEqual({
      success: false,
      error: 'entityId debe ser un UUID valido para este evento.',
    });

    expect(parseNotificationEventPayload({
      event: 'donation_status_changed',
      entityId: '10abc',
    })).toEqual({
      success: false,
      error: 'entityId de donacion invalido.',
    });
  });
});

describe('buildNotificationForEvent', () => {
  it('allows a donor to notify admins about their own catalog request', async () => {
    const supabase = createSupabase({
      solicitudes_alta_alimentos: {
        data: {
          id: CATALOG_REQUEST_ID,
          solicitante_id: DONOR_ID,
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
      entityId: CATALOG_REQUEST_ID,
    });

    expect(input).toMatchObject({
      categoria: 'catalogo',
      rolDestinatario: 'ADMINISTRADOR',
      urlAccion: '/admin/catalogo',
      metadatos: {
        event: 'catalog_food_request_created',
        solicitudId: CATALOG_REQUEST_ID,
        solicitanteId: DONOR_ID,
      },
    });
  });

  it('rejects a donor catalog request notification for another owner', async () => {
    const supabase = createSupabase({
      solicitudes_alta_alimentos: {
        data: {
          id: CATALOG_REQUEST_2_ID,
          solicitante_id: OTHER_DONOR_ID,
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
      entityId: CATALOG_REQUEST_2_ID,
    })).rejects.toMatchObject({
      status: 403,
      message: 'No puedes notificar una solicitud ajena.',
    });
  });

  it('builds a reviewed catalog notification for the donor owner', async () => {
    const supabase = createSupabase({
      solicitudes_alta_alimentos: {
        data: {
          id: CATALOG_REQUEST_ID,
          solicitante_id: DONOR_ID,
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
      entityId: CATALOG_REQUEST_ID,
    });

    expect(input).toMatchObject({
      tipo: 'success',
      categoria: 'catalogo',
      destinatarioId: DONOR_ID,
      urlAccion: '/donante/solicitar-alimento',
      metadatos: {
        event: 'catalog_food_request_reviewed',
        solicitudId: CATALOG_REQUEST_ID,
        estado: 'aprobada',
      },
    });
  });

  it('builds a food request status notification for admin/operator roles', async () => {
    const supabase = createSupabase({
      solicitudes: {
        data: {
          id: FOOD_REQUEST_ID,
          usuario_id: RECIPIENT_ID,
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
      entityId: FOOD_REQUEST_ID,
    });

    expect(input).toMatchObject({
      tipo: 'warning',
      categoria: 'solicitud',
      destinatarioId: RECIPIENT_ID,
      urlAccion: '/user/formulario',
      metadatos: {
        event: 'food_request_status_changed',
        solicitudId: FOOD_REQUEST_ID,
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
          user_id: DONOR_ID,
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
      destinatarioId: DONOR_ID,
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
