import { formatShortDate } from '@/lib/dateUtils';

interface ProductoInfo {
  nombre: string;
  categoria: string;
}

interface UnidadInfo {
  simbolo: string;
}

interface DonationSummaryProps {
  donante: string;
  producto: ProductoInfo | null;
  cantidad: string;
  unidad: UnidadInfo | null;
  fechaDisponible: string;
  direccion: string;
  horario?: string;
  horarioLabel?: string;
  personasAlimentadas: number;
  comidaEquivalente: string;
}

export default function DonationSummary({
  donante,
  producto,
  cantidad,
  unidad,
  fechaDisponible,
  direccion,
  horario,
  horarioLabel,
  personasAlimentadas,
  comidaEquivalente,
}: DonationSummaryProps) {
  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50 p-4" aria-labelledby="donation-summary-title">
      <h3 id="donation-summary-title" className="mb-3 font-medium text-blue-800">Resumen de tu donación</h3>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-blue-600">Donante</dt>
          <dd className="mt-1 font-semibold text-blue-800">{donante}</dd>
        </div>
        <div>
          <dt className="text-blue-600">Producto</dt>
          <dd className="mt-1 font-semibold text-blue-800">{producto?.nombre ?? 'No disponible'}{producto?.categoria ? ` (${producto.categoria})` : ''}</dd>
        </div>
        <div>
          <dt className="text-blue-600">Cantidad</dt>
          <dd className="mt-1 font-semibold text-blue-800">{cantidad} {unidad?.simbolo ?? ''}</dd>
        </div>
        <div>
          <dt className="text-blue-600">Fecha disponible</dt>
          <dd className="mt-1 font-semibold text-blue-800">{formatShortDate(fechaDisponible)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-blue-600">Dirección de recolección</dt>
          <dd className="mt-1 font-semibold text-blue-800">{direccion}</dd>
        </div>
        {horario && horarioLabel && (
          <div>
            <dt className="text-blue-600">Horario preferido</dt>
            <dd className="mt-1 font-semibold text-blue-800">{horarioLabel}</dd>
          </div>
        )}
      </dl>
      <div className="mt-3 rounded bg-purple-100 p-3">
        <p className="font-medium text-purple-800">Impacto estimado</p>
        <ul className="mt-1 space-y-1 text-sm text-purple-700">
          <li>{personasAlimentadas} personas alimentadas</li>
          <li>{comidaEquivalente}</li>
        </ul>
      </div>
    </section>
  );
}
