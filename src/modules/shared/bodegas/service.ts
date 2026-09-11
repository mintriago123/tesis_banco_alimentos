import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Tx } from '@/db/client';
import { depositos, donanteDepositos, solicitudesBodega, usuarios } from '@/db/schema';
import type { Bodega, BodegaSolicitud, BodegaSolicitudInput } from './types';

const ensureId = (value: string, name: string): string => {
  if (!value.trim()) {
    throw new Error(`${name} es obligatorio.`);
  }
  return value;
};

export class BodegasService {
  constructor(private readonly tx: Tx) {}

  async listarBodegas(donanteId: string): Promise<Bodega[]> {
    const id = ensureId(donanteId, 'donanteId');

    const rows = await this.tx
      .select({
        idDeposito: depositos.idDeposito,
        nombre: depositos.nombre,
        descripcion: depositos.descripcion,
        direccion: depositos.direccion,
        telefono: depositos.telefono,
        latitud: depositos.latitud,
        longitud: depositos.longitud,
        activo: depositos.activo,
        esPrincipal: donanteDepositos.esPrincipal,
        createdAt: donanteDepositos.createdAt,
      })
      .from(donanteDepositos)
      .innerJoin(depositos, eq(donanteDepositos.idDeposito, depositos.idDeposito))
      .where(and(eq(donanteDepositos.donanteId, id), eq(donanteDepositos.activo, true)))
      .orderBy(desc(donanteDepositos.esPrincipal), donanteDepositos.createdAt);

    return rows
      .filter((row) => row.activo)
      .map((row) => ({
        id_deposito: row.idDeposito,
        nombre: row.nombre,
        descripcion: row.descripcion,
        direccion: row.direccion,
        telefono: row.telefono,
        latitud: row.latitud,
        longitud: row.longitud,
        es_principal: row.esPrincipal,
        activo: row.activo,
        created_at: row.createdAt.toISOString(),
      }));
  }

  async listarSolicitudesDonante(donanteId: string): Promise<BodegaSolicitud[]> {
    const id = ensureId(donanteId, 'donanteId');

    const rows = await this.tx.select().from(solicitudesBodega).where(eq(solicitudesBodega.donanteId, id)).orderBy(desc(solicitudesBodega.createdAt));

    return rows.map(mapSolicitudRow);
  }

  async listarSolicitudesOperativas(): Promise<BodegaSolicitud[]> {
    const revisor = alias(usuarios, 'revisor');

    const rows = await this.tx
      .select({
        solicitud: solicitudesBodega,
        donanteId: usuarios.id,
        donanteNombre: usuarios.nombre,
        donanteEmail: usuarios.email,
        donanteTelefono: usuarios.telefono,
        bodegaId: depositos.idDeposito,
        bodegaNombre: depositos.nombre,
        bodegaDireccion: depositos.direccion,
        revisorId: revisor.id,
        revisorNombre: revisor.nombre,
      })
      .from(solicitudesBodega)
      .leftJoin(usuarios, eq(solicitudesBodega.donanteId, usuarios.id))
      .leftJoin(depositos, eq(solicitudesBodega.idDeposito, depositos.idDeposito))
      .leftJoin(revisor, eq(solicitudesBodega.revisadoPor, revisor.id))
      .orderBy(desc(solicitudesBodega.createdAt));

    return rows.map((row) => ({
      ...mapSolicitudRow(row.solicitud),
      donante: row.donanteId ? { id: row.donanteId, nombre: row.donanteNombre, email: row.donanteEmail, telefono: row.donanteTelefono } : null,
      // `depositos.nombre`/`direccion` are NOT NULL at the DB level; the `| null`
      // here is only Drizzle's left-join typing (the whole row is absent, never
      // partially null), already guarded by the `row.bodegaId` check.
      bodega: row.bodegaId ? { id_deposito: row.bodegaId, nombre: row.bodegaNombre!, direccion: row.bodegaDireccion } : null,
      revisor: row.revisorId ? { id: row.revisorId, nombre: row.revisorNombre } : null,
    }));
  }

  async crearSolicitud(input: BodegaSolicitudInput): Promise<string> {
    const [row] = await this.tx.execute<{ crear_solicitud_bodega: string }>(
      sql`select crear_solicitud_bodega(
        ${input.tipo}::text,
        ${input.nombre.trim()}::text,
        ${input.direccion.trim()}::text,
        ${input.telefono.trim()}::text,
        ${input.descripcion.trim() || null}::text,
        ${input.idDeposito ?? null}::uuid,
        ${input.latitud}::double precision,
        ${input.longitud}::double precision
      ) as crear_solicitud_bodega`,
    );

    if (!row || typeof row.crear_solicitud_bodega !== 'string') {
      throw new Error('No se pudo crear la solicitud de bodega.');
    }
    return row.crear_solicitud_bodega;
  }

  async aprobarSolicitud(solicitudId: string): Promise<string> {
    const id = ensureId(solicitudId, 'solicitudId');
    const [row] = await this.tx.execute<{ aprobar_solicitud_bodega: string }>(
      sql`select aprobar_solicitud_bodega(${id}::uuid) as aprobar_solicitud_bodega`,
    );
    if (!row || typeof row.aprobar_solicitud_bodega !== 'string') {
      throw new Error('No se pudo aprobar la solicitud.');
    }
    return row.aprobar_solicitud_bodega;
  }

  async rechazarSolicitud(solicitudId: string, motivo: string): Promise<string> {
    const id = ensureId(solicitudId, 'solicitudId');
    const reason = motivo.trim();
    if (reason.length < 5) {
      throw new Error('El motivo de rechazo es obligatorio.');
    }
    const [row] = await this.tx.execute<{ rechazar_solicitud_bodega: string }>(
      sql`select rechazar_solicitud_bodega(${id}::uuid, ${reason}::text) as rechazar_solicitud_bodega`,
    );
    if (!row || typeof row.rechazar_solicitud_bodega !== 'string') {
      throw new Error('No se pudo rechazar la solicitud.');
    }
    return row.rechazar_solicitud_bodega;
  }

  async cancelarSolicitud(solicitudId: string): Promise<boolean> {
    const id = ensureId(solicitudId, 'solicitudId');
    const [row] = await this.tx.execute<{ cancelar_solicitud_bodega: boolean }>(
      sql`select cancelar_solicitud_bodega(${id}::uuid) as cancelar_solicitud_bodega`,
    );
    if (!row || row.cancelar_solicitud_bodega !== true) {
      throw new Error('No se pudo cancelar la solicitud.');
    }
    return true;
  }
}

function mapSolicitudRow(row: typeof solicitudesBodega.$inferSelect): BodegaSolicitud {
  return {
    id: row.id,
    donante_id: row.donanteId,
    id_deposito: row.idDeposito,
    tipo: row.tipo as BodegaSolicitud['tipo'],
    nombre: row.nombre,
    descripcion: row.descripcion,
    direccion: row.direccion,
    telefono: row.telefono,
    latitud: row.latitud,
    longitud: row.longitud,
    estado: row.estado as BodegaSolicitud['estado'],
    motivo_rechazo: row.motivoRechazo,
    revisado_por: row.revisadoPor,
    revisado_at: row.revisadoAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
