import { NextRequest, NextResponse } from 'next/server';
import { validarCedulaEcuatoriana } from '@/lib/validaciones';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import {
  enforceDocumentLookupRateLimit,
  resolveServerServiceUrl,
} from '@/lib/document-lookup-security';

/**
 * Proxy para consultas a DINARAP
 * Resuelve problemas de Mixed Content al hacer la petición HTTP desde el servidor
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const authResult = await getAuthenticatedUser(supabase);

    if (authResult.response) {
      return authResult.response;
    }

    const searchParams = request.nextUrl.searchParams;
    const identificacion = searchParams.get('identificacion');

    if (!identificacion) {
      return NextResponse.json(
        { error: 'Parámetro "identificacion" es requerido' },
        { status: 400 }
      );
    }

    const identificacionLimpia = identificacion.trim();

    if (!/^\d{10}$/.test(identificacionLimpia) || !validarCedulaEcuatoriana(identificacionLimpia)) {
      return NextResponse.json(
        { error: 'Formato de identificación inválido' },
        { status: 400 }
      );
    }

    const serviceUrl = resolveServerServiceUrl('SERVICIO_CONSULTAS_DINARAP');

    if (!serviceUrl.success) {
      return serviceUrl.response;
    }

    const adminSupabase = createAdminSupabaseClient();
    const rateLimit = await enforceDocumentLookupRateLimit(adminSupabase, {
      userId: authResult.user.id,
      endpoint: 'consultar-cedula',
      documentValue: identificacionLimpia,
    });

    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    const url = new URL(serviceUrl.url.toString());
    url.searchParams.set('identificacion', identificacionLimpia);
    
    // Realizar la petición HTTP desde el servidor (permitido)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    // Devolver la respuesta al cliente
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('❌ Error en proxy de consulta de cédula:', error);
    return NextResponse.json(
      { error: 'Error al consultar identificación' },
      { status: 500 }
    );
  }
}
