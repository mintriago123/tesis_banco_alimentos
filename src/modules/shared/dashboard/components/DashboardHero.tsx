import Link from 'next/link';
import { ArrowRight, BarChart3, ClipboardCheck, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';

export type DashboardHeroRole = 'admin' | 'operador';

interface DashboardHeroProps {
  role: DashboardHeroRole;
  eyebrow: string;
  title: string;
  description: string;
  metricLabel: string;
  metricValue: number | string;
  primaryAction: { href: string; label: string };
  secondaryAction: { href: string; label: string };
}

interface HeroTheme {
  gradient: string;
  eyebrow: string;
  body: string;
  iconSurface: string;
  icon: LucideIcon;
  metricIcon: LucideIcon;
  primaryButton: string;
  secondaryButton: string;
  focusOffset: string;
}

const HERO_THEMES: Record<DashboardHeroRole, HeroTheme> = {
  admin: {
    gradient: 'from-rose-950 via-rose-900 to-red-800',
    eyebrow: 'text-rose-100',
    body: 'text-rose-50',
    iconSurface: 'bg-white/10',
    icon: ShieldCheck,
    metricIcon: BarChart3,
    primaryButton: 'bg-white text-rose-900 hover:bg-rose-50',
    secondaryButton: 'border-white/30 bg-white/10 text-white hover:bg-white/20',
    focusOffset: 'focus-visible:ring-offset-rose-900',
  },
  operador: {
    gradient: 'from-orange-950 via-orange-900 to-amber-800',
    eyebrow: 'text-orange-100',
    body: 'text-orange-50',
    iconSurface: 'bg-white/10',
    icon: ClipboardCheck,
    metricIcon: BarChart3,
    primaryButton: 'bg-white text-orange-900 hover:bg-orange-50',
    secondaryButton: 'border-white/30 bg-white/10 text-white hover:bg-white/20',
    focusOffset: 'focus-visible:ring-offset-orange-900',
  },
};

export function DashboardHero({
  role,
  eyebrow,
  title,
  description,
  metricLabel,
  metricValue,
  primaryAction,
  secondaryAction,
}: DashboardHeroProps) {
  const theme = HERO_THEMES[role];
  const Icon = theme.icon;
  const MetricIcon = theme.metricIcon;

  return (
    <section
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${theme.gradient} p-6 text-white shadow-lg sm:p-8`}
      aria-labelledby={`${role}-dashboard-hero-title`}
    >
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" aria-hidden="true" />
      <div className="absolute -bottom-28 right-20 h-64 w-64 rounded-full border-[28px] border-white/5" aria-hidden="true" />

      <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="max-w-2xl">
          <div className={`mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] ${theme.eyebrow}`}>
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            {eyebrow}
          </div>
          <h2 id={`${role}-dashboard-hero-title`} className="text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h2>
          <p className={`mt-3 max-w-xl text-sm leading-6 sm:text-base ${theme.body}`}>
            {description}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={primaryAction.href}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 ${theme.primaryButton} ${theme.focusOffset}`}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {primaryAction.label}
            </Link>
            <Link
              href={secondaryAction.href}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 ${theme.secondaryButton} ${theme.focusOffset}`}
            >
              {secondaryAction.label}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm lg:min-w-56">
          <div className="flex items-center gap-3">
            <span className={`rounded-xl p-3 ${theme.iconSurface}`}>
              <MetricIcon aria-hidden="true" className="h-6 w-6 text-white" />
            </span>
            <div>
              <p className={`text-xs font-medium uppercase tracking-wide ${theme.eyebrow}`}>{metricLabel}</p>
              <p className="mt-1 text-3xl font-bold">{metricValue}</p>
              <p className={`text-sm ${theme.body}`}>requieren seguimiento</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
