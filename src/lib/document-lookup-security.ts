import 'server-only';

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { dbAdmin } from '@/db/client';
import { apiDocumentLookupAuditLog } from '@/db/schema';

export const DOCUMENT_LOOKUP_RATE_LIMIT = {
  maxRequests: 20,
  windowSeconds: 10 * 60,
} as const;

export type DocumentLookupEndpoint = 'consultar-cedula' | 'consultar-ruc';

type ServiceUrlResult = { success: true; url: URL } | { success: false; response: NextResponse };
type RateLimitResult = { allowed: true } | { allowed: false; response: NextResponse };

type ConsumeQuotaRow = {
  allowed: boolean;
  requests_used: number;
  reset_at: string | null;
} & Record<string, unknown>;

const endpointLabels = {
  'consultar-cedula': 'consulta_cedula',
  'consultar-ruc': 'consulta_ruc',
} as const satisfies Record<DocumentLookupEndpoint, string>;

const configurationError = (message: string) => NextResponse.json({ error: message }, { status: 500 });

const hashDocument = (documentValue: string): string => createHash('sha256').update(documentValue).digest('hex');

const getWindowStartIso = (now = Date.now()): string => {
  const windowMs = DOCUMENT_LOOKUP_RATE_LIMIT.windowSeconds * 1000;
  return new Date(Math.floor(now / windowMs) * windowMs).toISOString();
};

const getRetryAfterSeconds = (resetAt: string | null | undefined): number => {
  if (!resetAt) {
    return DOCUMENT_LOOKUP_RATE_LIMIT.windowSeconds;
  }

  const resetTime = new Date(resetAt).getTime();
  if (!Number.isFinite(resetTime)) {
    return DOCUMENT_LOOKUP_RATE_LIMIT.windowSeconds;
  }

  return Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
};

export function resolveServerServiceUrl(envKey: 'SERVICIO_CONSULTAS_DINARAP' | 'SERVICIO_CONSULTAS_RUC'): ServiceUrlResult {
  const rawUrl = process.env[envKey]?.trim();

  if (!rawUrl) {
    return { success: false, response: configurationError('Servicio de consultas no configurado.') };
  }

  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return { success: false, response: configurationError('URL del servicio de consultas inválida.') };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { success: false, response: configurationError('El servicio de consultas debe usar HTTP o HTTPS.') };
  }

  // Compatibilidad temporal con los servicios legados de identidad, que solo exponen HTTP.
  // Las consultas siguen siendo server-side para evitar Mixed Content en el navegador.
  return { success: true, url };
}

/** `consume_document_lookup_quota` is service-role-only — always via `dbAdmin`, never RLS-scoped. */
export async function enforceDocumentLookupRateLimit(input: {
  userId: string;
  endpoint: DocumentLookupEndpoint;
  documentValue: string;
}): Promise<RateLimitResult> {
  const documentHash = hashDocument(input.documentValue);
  const windowStart = getWindowStartIso();
  const endpoint = endpointLabels[input.endpoint];

  let quota: ConsumeQuotaRow | undefined;
  try {
    const rows = await dbAdmin.execute<ConsumeQuotaRow>(
      sql`select * from consume_document_lookup_quota(${input.userId}::uuid, ${endpoint}, ${windowStart}::timestamptz, ${DOCUMENT_LOOKUP_RATE_LIMIT.maxRequests}, ${DOCUMENT_LOOKUP_RATE_LIMIT.windowSeconds})`,
    );
    quota = rows[0];
  } catch (error) {
    console.error('Error validando rate limit de consulta documental:', error);
    return { allowed: false, response: configurationError('No fue posible validar el límite de consultas.') };
  }

  if (typeof quota?.allowed !== 'boolean') {
    return { allowed: false, response: configurationError('Respuesta inválida del limitador de consultas.') };
  }

  const auditStatus = quota.allowed ? 'allowed' : 'blocked_rate_limit';

  try {
    await dbAdmin.insert(apiDocumentLookupAuditLog).values({
      userId: input.userId,
      endpoint,
      documentHash,
      status: auditStatus,
    });
  } catch (auditError) {
    console.error('Error registrando auditoría de consulta documental:', auditError);
    return { allowed: false, response: configurationError('No fue posible registrar la auditoría de la consulta.') };
  }

  if (!quota.allowed) {
    const retryAfter = getRetryAfterSeconds(quota.reset_at);

    return {
      allowed: false,
      response: NextResponse.json(
        { error: 'Límite de consultas excedido. Intenta nuevamente más tarde.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      ),
    };
  }

  return { allowed: true };
}
