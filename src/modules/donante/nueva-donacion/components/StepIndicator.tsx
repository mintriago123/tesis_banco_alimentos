import { Check } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

export default function StepIndicator({ currentStep, totalSteps, stepLabels }: StepIndicatorProps) {
  return (
    <nav aria-label="Progreso del formulario" className="w-full">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Paso {currentStep} de {totalSteps}
      </p>
      <ol className="flex w-full items-start">
        {Array.from({ length: totalSteps }).map((_, index) => {
          const stepNumber = index + 1;
          const isCompleted = currentStep > stepNumber;
          const isCurrent = currentStep === stepNumber;

          return (
            <li key={stepNumber} className="flex min-w-0 flex-1 items-start">
              <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                <div
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`${stepLabels[index]}${isCurrent ? ', paso actual' : ''}`}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition-colors ${
                    isCompleted || isCurrent
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" aria-hidden="true" /> : stepNumber}
                </div>
                <span className={`max-w-[5.5rem] text-xs font-medium leading-tight ${
                  isCompleted || isCurrent ? 'text-emerald-700' : 'text-slate-500'
                }`}>
                  {stepLabels[index]}
                </span>
              </div>
              {stepNumber < totalSteps && (
                <span
                  aria-hidden="true"
                  className={`mx-2 mt-4 h-px flex-1 ${
                    isCompleted ? 'bg-emerald-600' : 'bg-slate-200'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
