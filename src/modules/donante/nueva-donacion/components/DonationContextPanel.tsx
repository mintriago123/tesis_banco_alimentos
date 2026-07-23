import { CheckCircle2, ClipboardCheck, HandHeart, MapPin } from 'lucide-react';
import ImpactCalculator from './ImpactCalculator';

interface ImpactoData {
  personasAlimentadas: number;
  comidaEquivalente: string;
}

interface DonationContextPanelProps {
  pasoActual: number;
  impacto: ImpactoData;
  mostrarImpacto: boolean;
}

const steps = [
  'Registramos tu disponibilidad.',
  'Nuestro equipo revisa la información.',
  'Coordinamos la recepción de los alimentos.',
];

export default function DonationContextPanel({
  pasoActual,
  impacto,
  mostrarImpacto,
}: DonationContextPanelProps) {
  if (pasoActual === 1) {
    return (
      <aside className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6" aria-labelledby="context-panel-title">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-50 text-purple-600">
            <HandHeart className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="context-panel-title" className="text-base font-semibold text-slate-800">Tu aporte cuenta</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">Completa la cantidad para conocer su impacto estimado.</p>
          </div>
        </div>

        {mostrarImpacto ? (
          <ImpactCalculator impacto={impacto} mostrar={mostrarImpacto} />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-5 text-slate-500">
            El impacto aparecerá aquí cuando selecciones una cantidad y una unidad de medida.
          </div>
        )}
      </aside>
    );
  }

  if (pasoActual === 2) {
    return (
      <aside className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6" aria-labelledby="context-panel-title">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="context-panel-title" className="text-base font-semibold text-slate-800">Coordinemos la recolección</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">Estos son los siguientes pasos después de registrar tu disponibilidad.</p>
          </div>
        </div>
        <ol className="space-y-4">
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-sm leading-5 text-slate-500">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-emerald-600">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </aside>
    );
  }

  return (
    <aside className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6" aria-labelledby="context-panel-title">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 id="context-panel-title" className="text-base font-semibold text-slate-800">Todo listo para enviar</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500">Revisa los datos y confirma que la información sea correcta.</p>
        </div>
      </div>
      <div className="space-y-3 text-sm text-slate-500">
        <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />Tu donación quedará registrada para revisión.</p>
        <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />El equipo coordinará la recepción según la disponibilidad indicada.</p>
      </div>
    </aside>
  );
}
