/**
 * Componente selector de rol para registro
 */

import React from 'react';
import { Iconos } from '@/app/components/ui/Iconos';
import { ROLES_INFO } from '../constants';
import type { Rol } from '../types';

interface RoleSelectorProps {
  rolSeleccionado: Rol | null;
  onSeleccionarRol: (rol: Rol) => void;
}

export const RoleSelector: React.FC<RoleSelectorProps> = ({ rolSeleccionado, onSeleccionarRol }) => {
  if (rolSeleccionado) {
    return null;
  }

  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {ROLES_INFO.map((rol) => (
        <button
          key={rol.valor}
          type="button"
          onClick={() => onSeleccionarRol(rol.valor)}
          className={`rol-button flex flex-col items-center justify-center rounded-2xl border-2 bg-white p-6 text-center transition-colors hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${rol.valor === 'DONANTE' ? 'border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50' : 'border-blue-200 hover:border-blue-500 hover:bg-blue-50'}`}
        >
          {rol.valor === 'DONANTE' ? <Iconos.Donante /> : <Iconos.Solicitante />}
          <span className="mt-4 text-xl font-bold text-slate-950">{rol.titulo}</span>
          <p className="mt-2 text-sm text-slate-600">{rol.descripcion}</p>
        </button>
      ))}
    </div>
  );
};
