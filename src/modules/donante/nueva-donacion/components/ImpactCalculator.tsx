import { Heart, Info } from 'lucide-react';

interface ImpactoData {
  personasAlimentadas: number;
  comidaEquivalente: string;
}

interface ImpactCalculatorProps {
  impacto: ImpactoData;
  mostrar: boolean;
}

export default function ImpactCalculator({ impacto, mostrar }: ImpactCalculatorProps) {
  if (!mostrar) return null;

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4" role="status" aria-live="polite">
      <h3 className="mb-3 flex items-center gap-2 font-medium text-purple-800">
        <Heart className="h-5 w-5" aria-hidden="true" />
        Impacto Estimado de tu Donación
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-white p-3">
          <div className="text-2xl font-bold text-purple-700">
            ~{impacto.personasAlimentadas}
          </div>
          <div className="mt-1 text-sm text-purple-600">
            personas podrían alimentarse
          </div>
        </div>
        <div className="rounded-lg bg-white p-3">
          <div className="text-lg font-semibold text-purple-700">
            {impacto.comidaEquivalente}
          </div>
          <div className="mt-1 text-sm text-purple-600">
            equivalencia alimentaria
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded bg-white/60 p-2 text-xs leading-5 text-purple-600">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>*Estimación basada en promedios generales. El impacto real puede variar según el tipo de alimento y las necesidades específicas.</span>
      </div>
    </div>
  );
}
