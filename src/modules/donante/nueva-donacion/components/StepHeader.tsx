import type { LucideIcon } from 'lucide-react';

interface StepHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  iconColor?: string;
}

export default function StepHeader({ icon: Icon, title, description, iconColor = 'text-green-600' }: StepHeaderProps) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Icon className={`h-5 w-5 ${iconColor}`} aria-hidden="true" />
      </div>
      <div>
        <h2 id="current-step-title" className="text-base font-semibold text-slate-800 sm:text-lg">
          {title}
        </h2>
        <p className="mt-1 max-w-xl text-sm leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  );
}
