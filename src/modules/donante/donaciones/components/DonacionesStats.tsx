import { Clock, CheckCircle, XCircle, Heart } from 'lucide-react';
import { DonacionEstadisticas } from '../types';

interface DonacionesStatsProps {
  stats: DonacionEstadisticas;
}

export function DonacionesStats({ stats }: DonacionesStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
        <div className="flex items-center">
          <Clock className="w-8 h-8 text-yellow-600" />
          <div className="ml-3">
            <p className="text-sm font-medium text-yellow-600">Pendientes</p>
            <p className="text-2xl font-bold text-yellow-800">{stats.pendientes}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-center">
          <CheckCircle className="w-8 h-8 text-green-600" />
          <div className="ml-3">
            <p className="text-sm font-medium text-green-600">Aprobadas</p>
            <p className="text-2xl font-bold text-green-800">{stats.aprobadas}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-center">
          <XCircle className="w-8 h-8 text-red-600" />
          <div className="ml-3">
            <p className="text-sm font-medium text-red-600">Canceladas</p>
            <p className="text-2xl font-bold text-red-800">{stats.canceladas}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
        <div className="flex items-center">
          <Heart className="w-8 h-8 text-purple-600" />
          <div className="ml-3">
            <p className="text-sm font-medium text-purple-600">Impacto Total</p>
            <p className="text-2xl font-bold text-purple-800">{stats.impactoTotal}</p>
            <p className="text-xs text-purple-600">personas</p>
          </div>
        </div>
      </div>
    </div>
  );
}
