import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import type { ServiceResult, Solicitud, SolicitudActionResponse } from '../../types';
import type { SolicitudesInventoryService } from '../solicitudesInventoryService';
import type { SolicitudesLogger } from '../solicitudesLogger';
import type { SolicitudesMovementService } from '../solicitudesMovementService';
import type { SolicitudesNotificationService } from '../solicitudesNotificationService';

export interface SolicitudUseCaseDeps {
  /** RLS-scoped Drizzle transaction (from `withRlsContext`) — never `dbAdmin`. */
  db: PostgresJsDatabase<typeof schema>;
  inventoryService: SolicitudesInventoryService;
  movementService: SolicitudesMovementService;
  notificationService: SolicitudesNotificationService;
  logger: SolicitudesLogger;
}

export type SolicitudActionResult = Promise<ServiceResult<SolicitudActionResponse>>;

export interface SolicitudStateSnapshot {
  estado: Solicitud['estado'];
  fecha_respuesta?: string | null;
  comentario_admin?: string | null;
  codigo_comprobante?: string | null;
  operador_aprobacion_id?: string | null;
  fecha_aprobacion?: string | null;
  cantidad_entregada?: number | null;
  tiene_entregas_parciales?: boolean | null;
}
