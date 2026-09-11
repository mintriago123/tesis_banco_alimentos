import type { ActivityPoint } from '../types';

interface DashboardActivityProps {
  solicitudes: ActivityPoint[];
  donaciones: ActivityPoint[];
}

const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`));

const buildBars = (points: ActivityPoint[]) => {
  const maxValue = Math.max(...points.map(point => point.total), 0);

  return points.map(point => ({
    ...point,
    height: maxValue > 0 ? Math.max((point.total / maxValue) * 100, point.total > 0 ? 8 : 0) : 0
  }));
};

const Series = ({
  title,
  points,
  accentClass
}: {
  title: string;
  points: ActivityPoint[];
  accentClass: string;
}) => {
  const bars = buildBars(points);
  const total = points.reduce((sum, point) => sum + point.total, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-inner">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-500">Total 30 días: {total}</p>
        </div>
        <p className="text-xs text-slate-400">{formatShortDate(points[0]?.fecha ?? '')} - {formatShortDate(points.at(-1)?.fecha ?? '')}</p>
      </div>

      <div
        className="mt-4 grid h-36 items-end gap-1"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {bars.map(point => (
          <div key={`${title}-${point.fecha}`} className="flex h-full items-end">
            <div
              className={`w-full rounded-t-md ${accentClass}`}
              style={{ height: `${point.height}%` }}
              title={`${formatShortDate(point.fecha)}: ${point.total}`}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
        <span>{formatShortDate(points[0]?.fecha ?? '')}</span>
        <span>{formatShortDate(points[Math.floor(points.length / 2)]?.fecha ?? '')}</span>
        <span>{formatShortDate(points.at(-1)?.fecha ?? '')}</span>
      </div>
    </div>
  );
};

const DashboardActivity = ({ solicitudes, donaciones }: DashboardActivityProps) => (
  <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
    <h2 className="text-lg font-semibold text-slate-800">Actividad de 30 días</h2>
    <p className="text-sm text-slate-500">Comportamiento diario de solicitudes y donaciones recientes.</p>

    <div className="mt-5 grid gap-4 xl:grid-cols-2">
      <Series
        title="Solicitudes"
        points={solicitudes}
        accentClass="bg-gradient-to-t from-sky-500 to-sky-300"
      />
      <Series
        title="Donaciones"
        points={donaciones}
        accentClass="bg-gradient-to-t from-emerald-500 to-emerald-300"
      />
    </div>
  </div>
);

export default DashboardActivity;
