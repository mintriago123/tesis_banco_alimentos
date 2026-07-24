import Link from 'next/link';
import {
  ArrowUpRight,
  ClipboardCheck,
  FileBarChart,
  HandHeart,
  PackageSearch,
  ScanLine,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { DashboardHeroRole } from './DashboardHero';

interface DashboardQuickActionsProps {
  role: DashboardHeroRole;
}

interface ActionItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const ACTIONS: Record<DashboardHeroRole, ActionItem[]> = {
  admin: [
    {
      href: '/admin/reportes/solicitudes',
      label: 'Gestionar solicitudes',
      description: 'Revisa, aprueba y entrega solicitudes pendientes.',
      icon: ClipboardCheck,
    },
    {
      href: '/admin/reportes/donaciones',
      label: 'Revisar donaciones',
      description: 'Supervisa los aportes y su integración al inventario.',
      icon: HandHeart,
    },
    {
      href: '/admin/reportes/inventario',
      label: 'Consultar inventario',
      description: 'Analiza existencias, vencimientos y movimientos.',
      icon: PackageSearch,
    },
    {
      href: '/admin/usuarios',
      label: 'Administrar usuarios',
      description: 'Gestiona roles, estados y acceso al sistema.',
      icon: Users,
    },
  ],
  operador: [
    {
      href: '/operador/solicitudes',
      label: 'Gestionar solicitudes',
      description: 'Procesa las solicitudes que requieren atención.',
      icon: ClipboardCheck,
    },
    {
      href: '/operador/donaciones',
      label: 'Gestionar donaciones',
      description: 'Da seguimiento a los aportes recibidos.',
      icon: HandHeart,
    },
    {
      href: '/operador/inventario',
      label: 'Ajustar inventario',
      description: 'Actualiza cantidades y revisa alertas de stock.',
      icon: PackageSearch,
    },
    {
      href: '/operador/validar-comprobante',
      label: 'Validar comprobante',
      description: 'Confirma entregas de forma rápida y segura.',
      icon: ScanLine,
    },
  ],
};

const ROLE_STYLES: Record<DashboardHeroRole, { label: string; icon: string; surface: string; focus: string }> = {
  admin: {
    label: 'text-rose-700',
    icon: 'bg-rose-50 text-rose-700',
    surface: 'border-rose-200 hover:border-rose-300 hover:bg-rose-50/60',
    focus: 'focus-visible:ring-rose-600',
  },
  operador: {
    label: 'text-orange-700',
    icon: 'bg-orange-50 text-orange-700',
    surface: 'border-orange-200 hover:border-orange-300 hover:bg-orange-50/60',
    focus: 'focus-visible:ring-orange-600',
  },
};

export function DashboardQuickActions({ role }: DashboardQuickActionsProps) {
  const styles = ROLE_STYLES[role];

  return (
    <section aria-labelledby={`${role}-dashboard-actions-title`}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${styles.label}`}>Accesos directos</p>
          <h2 id={`${role}-dashboard-actions-title`} className="mt-1 text-xl font-bold text-slate-900">¿Qué necesitas hacer?</h2>
        </div>
        <FileBarChart aria-hidden="true" className="hidden h-6 w-6 text-slate-300 sm:block" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ACTIONS[role].map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`group rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${styles.surface} ${styles.focus}`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className={`rounded-xl p-3 ${styles.icon}`}>
                <Icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <ArrowUpRight aria-hidden="true" className="h-5 w-5 text-slate-300 transition group-hover:text-slate-500" />
            </div>
            <h3 className="mt-5 text-sm font-bold text-slate-900">{label}</h3>
            <p className="mt-2 text-sm leading-5 text-slate-500">{description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
