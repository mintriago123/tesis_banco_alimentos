import { NextRequest, NextResponse } from 'next/server';
import { validarRucEcuatoriano } from '@/lib/validaciones';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';
import {
  enforceDocumentLookupRateLimit,
  resolveServerServiceUrl,
} from '@/lib/document-lookup-security';

/**
 * Proxy para consultas de RUC
 * Resuelve problemas de Mixed Content al hacer la petición HTTP desde el servidor
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const auth = await requireAuth(supabase);

    if (auth.response) {
      return auth.response;
    }

    const searchParams = request.nextUrl.searchParams;
    const ruc = searchParams.get('ruc');

    if (!ruc) {
      return NextResponse.json(
        { error: 'Parámetro "ruc" es requerido' },
        { status: 400 }
      );
    }

    const rucLimpio = ruc.trim();

    if (!/^\d{13}$/.test(rucLimpio) || !validarRucEcuatoriano(rucLimpio)) {
      return NextResponse.json(
        { error: 'Formato de RUC inválido' },
        { status: 400 }
      );
    }

    const serviceUrl = resolveServerServiceUrl('SERVICIO_CONSULTAS_RUC');

    if (!serviceUrl.success) {
      return serviceUrl.response;
    }

    const adminSupabase = createAdminSupabaseClient();
    const rateLimit = await enforceDocumentLookupRateLimit(adminSupabase, {
      userId: auth.user.id,
      endpoint: 'consultar-ruc',
      documentValue: rucLimpio,
    });

    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    const url = new URL(serviceUrl.url.toString());
    url.searchParams.set('ruc', rucLimpio);
    
    // Realizar la petición HTTP desde el servidor (permitido)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    // Devolver la respuesta al cliente
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('❌ Error en proxy de consulta de RUC:', error);
    return NextResponse.json(
      { error: 'Error al consultar RUC' },
      { status: 500 }
    );
  }
}
