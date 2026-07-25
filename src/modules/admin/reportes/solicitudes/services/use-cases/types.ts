import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceResult, Solicitud, SolicitudActionResponse } from '../../types';
import type { SolicitudesInventoryService } from '../solicitudesInventoryService';
import type { SolicitudesLogger } from '../solicitudesLogger';
import type { SolicitudesMovementService } from '../solicitudesMovementService';
import type { SolicitudesNotificationService } from '../solicitudesNotificationService';

export interface SolicitudUseCaseDeps {
  supabaseClient: SupabaseClient;
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
