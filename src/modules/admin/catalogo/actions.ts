'use server';

import bcrypt from 'bcryptjs';
import { count, eq, isNotNull, sql } from 'drizzle-orm';
import { dbAdmin, withRlsContext, type Tx } from '@/db/client';
import { alimentos, alimentosUnidades, conversiones, donaciones, productosDonados, tiposMagnitud, unidades, users } from '@/db/schema';
import { requireRole } from '@/lib/server-auth';
import type { CatalogStats, FoodFormValues, FoodRecord, ServiceResult, Unidad, UnidadAlimento } from './types';

async function withAdmin<T>(fn: (tx: Tx, adminId: string) => Promise<T>): Promise<T | ServiceResult<never>> {
  const auth = await requireRole(['ADMINISTRADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado.' };
  }
  return withRlsContext(auth.profile.id, (tx) => fn(tx, auth.profile.id));
}

export async function fetchFoodsAction(): Promise<ServiceResult<FoodRecord[]>> {
  const result = await withAdmin(async (tx) => {
    try {
      const rows = await tx.select({ id: alimentos.id, nombre: alimentos.nombre, categoria: alimentos.categoria }).from(alimentos).orderBy(alimentos.nombre);

      const conUnidades = await Promise.all(
        rows.map(async (alimento) => {
          const unidadesRows = await tx.execute(sql`select * from obtener_unidades_alimento(${alimento.id})`);
          return { id: alimento.id, nombre: alimento.nombre, categoria: alimento.categoria ?? '', unidades: unidadesRows as unknown as UnidadAlimento[] };
        }),
      );

      return { success: true as const, data: conUnidades };
    } catch (err) {
      return { success: false as const, error: 'Error inesperado al cargar los alimentos', errorDetails: err };
    }
  });
  return result as ServiceResult<FoodRecord[]>;
}

export async function fetchCategoriesAction(): Promise<ServiceResult<string[]>> {
  const result = await withAdmin(async (tx) => {
    try {
      const rows = await tx.selectDistinct({ categoria: alimentos.categoria }).from(alimentos).where(isNotNull(alimentos.categoria)).orderBy(alimentos.categoria);
      return { success: true as const, data: rows.map((r) => r.categoria).filter((c): c is string => Boolean(c)) };
    } catch (err) {
      return { success: false as const, error: 'Error inesperado al cargar las categorías', errorDetails: err };
    }
  });
  return result as ServiceResult<string[]>;
}

function resolveCategoria(values: FoodFormValues): string | null {
  const categoria = values.categoria === 'personalizada' ? values.categoriaPersonalizada?.trim() : values.categoria?.trim();
  return categoria || null;
}

export async function createFoodAction(values: FoodFormValues): Promise<ServiceResult<void>> {
  const result = await withAdmin(async (tx) => {
    try {
      const categoriaFinal = resolveCategoria(values);
      if (!categoriaFinal) return { success: false as const, error: 'Debes proporcionar una categoría para el alimento' };
      if (!values.unidades_ids || values.unidades_ids.length === 0) {
        return { success: false as const, error: 'Debes seleccionar al menos una unidad de medida' };
      }

      const [alimento] = await tx.insert(alimentos).values({ nombre: values.nombre.trim(), categoria: categoriaFinal }).returning({ id: alimentos.id });
      if (!alimento) return { success: false as const, error: 'No fue posible registrar el alimento' };

      try {
        await tx.insert(alimentosUnidades).values(
          values.unidades_ids.map((unidadId) => ({
            alimentoId: alimento.id,
            unidadId,
            esUnidadPrincipal: values.unidad_principal_id === unidadId,
          })),
        );
      } catch (unidadesError) {
        await tx.delete(alimentos).where(eq(alimentos.id, alimento.id));
        return { success: false as const, error: 'No fue posible asociar las unidades al alimento', errorDetails: unidadesError };
      }

      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: 'Error inesperado al registrar el alimento', errorDetails: err };
    }
  });
  return result as ServiceResult<void>;
}

export async function updateFoodAction(foodId: number, values: FoodFormValues): Promise<ServiceResult<void>> {
  const result = await withAdmin(async (tx) => {
    try {
      const categoriaFinal = resolveCategoria(values);
      if (!categoriaFinal) return { success: false as const, error: 'Debes proporcionar una categoría para el alimento' };
      if (!values.unidades_ids || values.unidades_ids.length === 0) {
        return { success: false as const, error: 'Debes seleccionar al menos una unidad de medida' };
      }

      await tx.update(alimentos).set({ nombre: values.nombre.trim(), categoria: categoriaFinal }).where(eq(alimentos.id, foodId));
      await tx.delete(alimentosUnidades).where(eq(alimentosUnidades.alimentoId, foodId));
      await tx.insert(alimentosUnidades).values(
        values.unidades_ids.map((unidadId) => ({
          alimentoId: foodId,
          unidadId,
          esUnidadPrincipal: values.unidad_principal_id === unidadId,
        })),
      );

      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: 'Error inesperado al actualizar el alimento', errorDetails: err };
    }
  });
  return result as ServiceResult<void>;
}

export async function checkFoodUsageAction(foodId: number): Promise<ServiceResult<{ totalDonaciones: number; totalProductos: number }>> {
  const result = await withAdmin(async (tx) => {
    try {
      const [[donacionesRow], [productosRow]] = await Promise.all([
        tx.select({ total: count() }).from(donaciones).where(eq(donaciones.alimentoId, foodId)),
        tx.select({ total: count() }).from(productosDonados).where(eq(productosDonados.alimentoId, foodId)),
      ]);

      return { success: true as const, data: { totalDonaciones: donacionesRow?.total ?? 0, totalProductos: productosRow?.total ?? 0 } };
    } catch (err) {
      return { success: false as const, error: 'Error al verificar el uso del alimento', errorDetails: err };
    }
  });
  return result as ServiceResult<{ totalDonaciones: number; totalProductos: number }>;
}

export async function deleteFoodAction(foodId: number, cascade = false): Promise<ServiceResult<void>> {
  const usage = await checkFoodUsageAction(foodId);
  if (!usage.success || !usage.data) {
    return { success: false, error: usage.error || 'No se pudo verificar el uso del alimento' };
  }

  const { totalDonaciones, totalProductos } = usage.data;
  const totalReferencias = totalDonaciones + totalProductos;

  if (totalReferencias > 0 && !cascade) {
    const mensajes: string[] = [];
    if (totalDonaciones > 0) mensajes.push(`${totalDonaciones} donación${totalDonaciones > 1 ? 'es' : ''}`);
    if (totalProductos > 0) mensajes.push(`${totalProductos} producto${totalProductos > 1 ? 's' : ''} donado${totalProductos > 1 ? 's' : ''}`);
    return {
      success: false,
      error: `Este alimento está siendo usado en ${mensajes.join(' y ')}`,
      errorDetails: { needsCascade: true, totalDonaciones, totalProductos },
    };
  }

  const result = await withAdmin(async (tx) => {
    try {
      if (cascade && totalReferencias > 0) {
        if (totalDonaciones > 0) {
          await tx.update(donaciones).set({ alimentoId: null }).where(eq(donaciones.alimentoId, foodId));
        }
        if (totalProductos > 0) {
          await tx.update(productosDonados).set({ alimentoId: null }).where(eq(productosDonados.alimentoId, foodId));
        }
      }

      await tx.delete(alimentos).where(eq(alimentos.id, foodId));
      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: 'No fue posible eliminar el alimento', errorDetails: err };
    }
  });
  return result as ServiceResult<void>;
}

export async function fetchCatalogStatsAction(): Promise<ServiceResult<CatalogStats>> {
  const foods = await fetchFoodsAction();
  if (!foods.success || !foods.data) {
    return { success: false, error: foods.error };
  }
  const categorias = new Set(foods.data.map((f) => f.categoria).filter(Boolean));
  return { success: true, data: { totalAlimentos: foods.data.length, totalCategorias: categorias.size } };
}

export async function fetchUnidadesAction(): Promise<ServiceResult<Unidad[]>> {
  const result = await withAdmin(async (tx) => {
    try {
      const rows = await tx
        .select({
          id: unidades.id,
          nombre: unidades.nombre,
          simbolo: unidades.simbolo,
          tipoMagnitudId: unidades.tipoMagnitudId,
          tipoMagnitudNombre: tiposMagnitud.nombre,
          esBase: unidades.esBase,
          activa: unidades.activa,
          esDiscreta: unidades.esDiscreta,
          esPresentacion: unidades.esPresentacion,
          permiteFraccion: unidades.permiteFraccion,
        })
        .from(unidades)
        .innerJoin(tiposMagnitud, eq(unidades.tipoMagnitudId, tiposMagnitud.id))
        .where(eq(unidades.activa, true))
        .orderBy(unidades.tipoMagnitudId, unidades.nombre);

      const conversionRows = await tx
        .select({ origen: conversiones.unidadOrigenId, destino: conversiones.unidadDestinoId })
        .from(conversiones)
        .where(eq(conversiones.activo, true));

      const convertibles = new Set(conversionRows.flatMap((c) => [c.origen, c.destino]));

      const data: Unidad[] = rows.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        simbolo: u.simbolo,
        tipo_magnitud_id: u.tipoMagnitudId,
        tipo_magnitud_nombre: u.tipoMagnitudNombre ?? undefined,
        es_base: u.esBase,
        activa: u.activa,
        es_discreta: u.esDiscreta,
        es_presentacion: u.esPresentacion,
        permite_fraccion: u.permiteFraccion,
        es_convertible: convertibles.has(u.id),
      }));

      return { success: true as const, data };
    } catch (err) {
      return { success: false as const, error: 'Error inesperado al cargar unidades', errorDetails: err };
    }
  });
  return result as ServiceResult<Unidad[]>;
}

/**
 * Re-verifies the current admin's password before a destructive cascade
 * action — replaces the old flow's `supabase.auth.signInWithPassword`
 * re-auth check (there's no client-side auth call anymore, so this confirms
 * the password against the stored bcrypt hash directly).
 */
export async function verifyCurrentPasswordAction(password: string): Promise<ServiceResult<void>> {
  const auth = await requireRole(['ADMINISTRADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado.' };
  }

  const [user] = await dbAdmin.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, auth.profile.id)).limit(1);
  if (!user) {
    return { success: false, error: 'No se pudo verificar tu identidad' };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { success: false, error: 'Contraseña incorrecta. Verifica e intenta nuevamente.' };
  }

  return { success: true };
}

export async function deleteCategoryAction(categoryName: string): Promise<ServiceResult<void>> {
  if (categoryName === 'Sin categoría') {
    return { success: false, error: 'No se puede eliminar la categoría "Sin categoría"' };
  }

  const result = await withAdmin(async (tx) => {
    try {
      await tx.delete(alimentos).where(eq(alimentos.categoria, categoryName));
      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: 'No fue posible eliminar la categoría y sus alimentos', errorDetails: err };
    }
  });
  return result as ServiceResult<void>;
}
