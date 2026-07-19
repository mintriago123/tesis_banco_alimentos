import { NextRequest, NextResponse } from 'next/server';
import { validarRucEcuatoriano } from '@/lib/validaciones';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAuthenticatedUser } from '@/lib/server-auth';

/**
 * Proxy para consultas de RUC
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

    // Obtener la URL del servicio externo desde variables de entorno del servidor
    const servicioUrl = process.env.SERVICIO_CONSULTAS_RUC || process.env.NEXT_PUBLIC_SERVICIO_CONSULTAS_RUC;
    
    if (!servicioUrl) {
      console.error('❌ Variable de entorno SERVICIO_CONSULTAS_RUC no configurada');
      return NextResponse.json(
        { error: 'Servicio de consultas no configurado' },
        { status: 500 }
      );
    }

    const url = new URL(servicioUrl);
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
