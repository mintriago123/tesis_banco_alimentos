import { Heart } from 'lucide-react';

interface DonacionesHeaderProps {
  totalDonaciones: number;
}

export function DonacionesHeader({ totalDonaciones }: DonacionesHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5">
        <Heart aria-hidden="true" className="h-5 w-5 text-emerald-700" />
        <span className="text-sm font-semibold text-emerald-800">
          {totalDonaciones} donaciones realizadas
        </span>
      </div>
    </div>
  );
}
