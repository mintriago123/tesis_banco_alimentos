import { ChevronLeft, ChevronRight, Heart } from 'lucide-react';

interface StepNavigationProps {
  pasoActual: number;
  totalPasos: number;
  onAnterior: () => void;
  onSiguiente: () => void;
  onEnviar: (e: React.FormEvent) => void;
  enviando: boolean;
}

export default function StepNavigation({
  pasoActual,
  totalPasos,
  onAnterior,
  onSiguiente,
  enviando,
}: StepNavigationProps) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
      {pasoActual > 1 && (
        <button
          type="button"
          onClick={onAnterior}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 sm:w-auto"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Atrás
        </button>
      )}

      {pasoActual < totalPasos && (
        <button
          type="button"
          onClick={onSiguiente}
          className="ml-auto flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:w-auto"
        >
          Siguiente <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {pasoActual === totalPasos && (
        <button
          type="submit"
          disabled={enviando}
          className={`ml-auto flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:w-auto ${
            enviando ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {enviando ? 'Enviando...' : (
            <>
              <Heart className="h-5 w-5" aria-hidden="true" />
              Enviar Donación
            </>
          )}
        </button>
      )}
    </div>
  );
}
