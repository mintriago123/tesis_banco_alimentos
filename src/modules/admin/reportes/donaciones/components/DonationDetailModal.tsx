'use client';

/**
 * @fileoverview Modal de detalle de una donación para reportes administrativos.
 */

import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Gift,
  Package,
  TrendingUp,
  Truck,
  UserRound,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Button } from '@/app/components';
import { Modal } from '@/app/components/ui/Modal';
import { MOTIVO_CANCELACION_LABELS } from '@/modules/shared/donaciones/constants';
import type { Donation, DonationEstado } from '../types';
import { isExpired, isNearExpiration } from '../utils/formatters';
import { formatShortDate } from '@/lib/dateUtils';

interface DonationDetailModalProps {
  donation: Donation | null;
  isOpen: boolean;
  onClose: () => void;
}

type ModalDonationEstado = DonationEstado | 'Recogida' | 'Entregada' | 'Desconocido';
type BadgeVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

interface EstadoInfo {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly description: string;
  readonly variant: BadgeVariant;
  readonly surfaceClass: string;
  readonly iconClass: string;
}

const ESTADO_INFO: Record<ModalDonationEstado, EstadoInfo> = {
  Pendiente: {
    icon: Clock3,
    label: 'Pendiente',
    description: 'Esperando aprobación del administrador',
    variant: 'warning',
    surfaceClass: 'border-amber-200 bg-amber-50',
    iconClass: 'bg-amber-100 text-amber-800',
  },
  Aprobada: {
    icon: CheckCircle2,
    label: 'Aprobada',
    description: 'Donación aprobada e integrada al inventario',
    variant: 'success',
    surfaceClass: 'border-emerald-200 bg-emerald-50',
    iconClass: 'bg-emerald-100 text-emerald-800',
  },
  Cancelada: {
    icon: XCircle,
    label: 'Cancelada',
    description: 'La donación fue cancelada',
    variant: 'error',
    surfaceClass: 'border-rose-200 bg-rose-50',
    iconClass: 'bg-rose-100 text-rose-800',
  },
  Recogida: {
    icon: Truck,
    label: 'Recogida',
    description: 'Estado legado, equivalente a una donación aprobada',
    variant: 'success',
    surfaceClass: 'border-emerald-200 bg-emerald-50',
    iconClass: 'bg-emerald-100 text-emerald-800',
  },
  Entregada: {
    icon: CheckCircle2,
    label: 'Entregada',
    description: 'Estado legado, donación entregada',
    variant: 'success',
    surfaceClass: 'border-emerald-200 bg-emerald-50',
    iconClass: 'bg-emerald-100 text-emerald-800',
  },
  Desconocido: {
    icon: AlertCircle,
    label: 'Estado desconocido',
    description: 'Revise la consistencia del estado de la donación',
    variant: 'default',
    surfaceClass: 'border-slate-200 bg-slate-50',
    iconClass: 'bg-slate-100 text-slate-700',
  },
};

const PERSON_TYPE_LABELS = {
  Natural: 'Persona natural',
  Juridica: 'Persona jurídica',
} as const;

const normalizeDonationEstado = (rawEstado: string): ModalDonationEstado => {
  const normalized = rawEstado.trim().toLowerCase();

  if (normalized === 'pendiente') return 'Pendiente';
  if (normalized === 'aprobada' || normalized === 'aprobado') return 'Aprobada';
  if (normalized === 'cancelada' || normalized === 'cancelado') return 'Cancelada';
  if (normalized === 'recogida' || normalized === 'recogido') return 'Recogida';
  if (normalized === 'entregada' || normalized === 'entregado') return 'Entregada';

  return 'Desconocido';
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'No disponible';
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};

const formatNumber = (value: number | null | undefined) => (
  value === null || value === undefined
    ? 'Sin estimación'
    : new Intl.NumberFormat('es-EC').format(value)
);

const displayText = (value: string | null | undefined) => value?.trim() || 'No registrado';

const toId = (value: string) => value
  .toLocaleLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');

interface DetailItemProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
}

function DetailItem({ label, children, className = '' }: DetailItemProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-5 text-slate-900">{children}</dd>
    </div>
  );
}

interface InfoSectionProps {
  readonly title: string;
  readonly icon: LucideIcon;
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'accent';
}

function InfoSection({ title, icon: Icon, children, tone = 'neutral' }: InfoSectionProps) {
  const titleId = `${toId(title)}-section-title`;

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <h3 id={titleId} className="flex items-center gap-2 text-sm font-bold text-slate-950">
        <Icon aria-hidden="true" className={`h-4 w-4 ${tone === 'accent' ? 'text-rose-700' : 'text-slate-500'}`} />
        {title}
      </h3>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        {children}
      </div>
    </section>
  );
}

const DonationDetailModal = ({ donation, isOpen, onClose }: DonationDetailModalProps) => {
  if (!isOpen || !donation) return null;

  const modalEstado = normalizeDonationEstado(donation.estado);
  const estadoInfo = ESTADO_INFO[modalEstado];
  const EstadoIcon = estadoInfo.icon;
  const expiryStatus = donation.fecha_vencimiento
    ? isExpired(donation.fecha_vencimiento)
      ? { label: 'Vencido', variant: 'error' as const, className: 'text-rose-700' }
      : isNearExpiration(donation.fecha_vencimiento)
        ? { label: 'Próximo a vencer', variant: 'warning' as const, className: 'text-amber-700' }
        : { label: 'Vigente', variant: 'success' as const, className: 'text-emerald-700' }
    : { label: 'No especificada', variant: 'default' as const, className: 'text-slate-600' };

  const productName = displayText(donation.alimento?.nombre || donation.tipo_producto);
  const personIdentifier = donation.tipo_persona_donante === 'Juridica'
    ? donation.ruc_donante
    : donation.cedula_donante;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Detalle de donación"
      description={`${productName} · ${displayText(donation.nombre_donante)}`}
      size="lg"
    >
      <div className="space-y-5">
        <section className={`rounded-2xl border p-4 ${estadoInfo.surfaceClass}`} aria-label="Estado de la donación">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${estadoInfo.iconClass}`} aria-hidden="true">
                <EstadoIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado actual</p>
                <p className="mt-1 text-lg font-bold text-slate-950">{estadoInfo.label}</p>
                <p className="mt-1 text-sm text-slate-700">{estadoInfo.description}</p>
              </div>
            </div>
            <Badge variant={estadoInfo.variant}>{estadoInfo.label}</Badge>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <InfoSection title="Donante" icon={donation.tipo_persona_donante === 'Juridica' ? Building2 : UserRound} tone="accent">
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Nombre">{displayText(donation.nombre_donante)}</DetailItem>
              <DetailItem label={donation.tipo_persona_donante === 'Juridica' ? 'RUC' : 'Cédula'}>{displayText(personIdentifier)}</DetailItem>
              <DetailItem label="Tipo de persona">{PERSON_TYPE_LABELS[donation.tipo_persona_donante]}</DetailItem>
              {donation.representante_donante && <DetailItem label="Representante">{donation.representante_donante}</DetailItem>}
              <DetailItem label="Correo">
                {donation.email ? (
                  <a href={`mailto:${donation.email}`} className="break-all text-rose-700 underline decoration-rose-200 underline-offset-2 hover:text-rose-900">
                    {donation.email}
                  </a>
                ) : 'No registrado'}
              </DetailItem>
              <DetailItem label="Teléfono">
                {donation.telefono ? (
                  <a href={`tel:${donation.telefono}`} className="text-rose-700 underline decoration-rose-200 underline-offset-2 hover:text-rose-900">
                    {donation.telefono}
                  </a>
                ) : 'No registrado'}
              </DetailItem>
              {donation.direccion_donante_completa && <DetailItem label="Dirección del donante" className="sm:col-span-2">{donation.direccion_donante_completa}</DetailItem>}
            </dl>
          </InfoSection>

          <InfoSection title="Donación" icon={Package} tone="accent">
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Producto">{productName}</DetailItem>
              <DetailItem label="Categoría">{displayText(donation.categoria_comida)}</DetailItem>
              <DetailItem label="Cantidad">
                <span className="text-base font-bold">{formatNumber(donation.cantidad)} {donation.unidad_simbolo}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{donation.unidad_nombre}</span>
              </DetailItem>
              <DetailItem label="Tipo de registro">
                {donation.es_producto_personalizado ? <Badge variant="info">Producto personalizado</Badge> : 'Producto del catálogo'}
              </DetailItem>
            </dl>
          </InfoSection>

          <InfoSection title="Logística y fechas" icon={CalendarDays}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Disponible desde">{formatShortDate(donation.fecha_disponible)}</DetailItem>
              <DetailItem label="Registrada el">{formatDateTime(donation.creado_en)}</DetailItem>
              <DetailItem label="Fecha de vencimiento" className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={expiryStatus.className}>
                    {donation.fecha_vencimiento ? formatShortDate(donation.fecha_vencimiento) : expiryStatus.label}
                  </span>
                  {donation.fecha_vencimiento && <Badge variant={expiryStatus.variant} size="sm">{expiryStatus.label}</Badge>}
                </div>
              </DetailItem>
              <DetailItem label="Dirección de entrega" className="sm:col-span-2">{displayText(donation.direccion_entrega)}</DetailItem>
              {donation.horario_preferido && <DetailItem label="Horario preferido">{donation.horario_preferido}</DetailItem>}
            </dl>
          </InfoSection>

          <InfoSection title="Impacto estimado" icon={TrendingUp}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-rose-100 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Personas beneficiadas</p>
                <p className="mt-1 text-3xl font-bold text-rose-700">{formatNumber(donation.impacto_estimado_personas)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Equivalente</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-slate-900">{displayText(donation.impacto_equivalente)}</p>
              </div>
            </div>
          </InfoSection>
        </div>

        {donation.observaciones && (
          <InfoSection title="Observaciones" icon={FileText}>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{donation.observaciones}</p>
          </InfoSection>
        )}

        {modalEstado === 'Cancelada' && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4" aria-labelledby="cancelacion-donacion-title">
            <h3 id="cancelacion-donacion-title" className="flex items-center gap-2 text-sm font-bold text-rose-950">
              <XCircle aria-hidden="true" className="h-4 w-4 text-rose-700" />
              Información de cancelación
            </h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              {donation.fecha_cancelacion && <DetailItem label="Fecha de cancelación">{formatDateTime(donation.fecha_cancelacion)}</DetailItem>}
              {donation.motivo_cancelacion && <DetailItem label="Motivo">{MOTIVO_CANCELACION_LABELS[donation.motivo_cancelacion]}</DetailItem>}
              {donation.observaciones_cancelacion && <DetailItem label="Observaciones" className="sm:col-span-2">{donation.observaciones_cancelacion}</DetailItem>}
            </dl>
          </section>
        )}

        {donation.codigo_comprobante && (
          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4" aria-labelledby="comprobante-donacion-title">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700" aria-hidden="true">
                  <Gift className="h-5 w-5" />
                </span>
                <div>
                  <h3 id="comprobante-donacion-title" className="text-sm font-bold text-blue-950">Comprobante de donación</h3>
                  <p className="mt-1 text-xs text-blue-800">Código de verificación</p>
                  <p className="mt-1 font-mono text-xl font-bold tracking-wide text-blue-900">{donation.codigo_comprobante}</p>
                </div>
              </div>
              <a
                href={`/comprobante/${donation.codigo_comprobante}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
                Ver comprobante
              </a>
            </div>
          </section>
        )}

        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            Información técnica
          </summary>
          <dl className="grid gap-3 border-t border-slate-200 px-4 py-4 text-sm sm:grid-cols-2">
            <DetailItem label="ID de donación"><span className="font-mono text-xs">{donation.id}</span></DetailItem>
            <DetailItem label="ID de usuario"><span className="break-all font-mono text-xs">{donation.user_id}</span></DetailItem>
            {donation.id_deposito && <DetailItem label="ID de bodega"><span className="break-all font-mono text-xs">{donation.id_deposito}</span></DetailItem>}
            <DetailItem label="Última actualización">{formatDateTime(donation.actualizado_en)}</DetailItem>
          </dl>
        </details>

        <div className="flex justify-end border-t border-slate-200 pt-4">
          <Button type="button" accent="admin" onClick={onClose}>
            Cerrar detalle
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DonationDetailModal;
