import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

type DashboardCardAccent = 'emerald' | 'blue' | 'amber' | 'violet';

interface DashboardCardProps {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: DashboardCardAccent;
}

const accentStyles = {
  emerald: {
    icon: 'bg-emerald-100 text-emerald-700',
    title: 'text-emerald-950',
    arrow: 'text-emerald-600',
    border: 'border-emerald-200 hover:border-emerald-300',
    surface: 'hover:bg-emerald-50',
  },
  blue: {
    icon: 'bg-blue-100 text-blue-700',
    title: 'text-blue-950',
    arrow: 'text-blue-600',
    border: 'border-blue-200 hover:border-blue-300',
    surface: 'hover:bg-blue-50',
  },
  amber: {
    icon: 'bg-amber-100 text-amber-700',
    title: 'text-amber-950',
    arrow: 'text-amber-600',
    border: 'border-amber-200 hover:border-amber-300',
    surface: 'hover:bg-amber-50',
  },
  violet: {
    icon: 'bg-violet-100 text-violet-700',
    title: 'text-violet-950',
    arrow: 'text-violet-600',
    border: 'border-violet-200 hover:border-violet-300',
    surface: 'hover:bg-violet-50',
  },
} satisfies Record<DashboardCardAccent, Record<'icon' | 'title' | 'arrow' | 'border' | 'surface', string>>;

export function DashboardCard({ href, title, description, icon: Icon, accent }: DashboardCardProps) {
  const styles = accentStyles[accent];

  return (
    <Link
      href={href}
      className={`group flex min-h-36 flex-col justify-between rounded-2xl border bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${styles.border} ${styles.surface}`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`rounded-xl p-3 ${styles.icon}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <ArrowUpRight aria-hidden="true" className={`h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${styles.arrow}`} />
      </div>
      <div className="mt-6">
        <h3 className={`text-base font-semibold ${styles.title}`}>{title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
      </div>
    </Link>
  );
}
