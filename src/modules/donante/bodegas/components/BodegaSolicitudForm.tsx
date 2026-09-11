'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapPin, Save, X } from 'lucide-react';
import { MapboxLocationPicker } from '@/modules/shared/components';
import type { Bodega, BodegaSolicitudInput } from '@/modules/shared/bodegas';
import { validateBodegaInput } from '../bodegaValidation';

interface BodegaSolicitudFormProps {
  readonly bodega?: Bodega | null;
  readonly submitting: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: BodegaSolicitudInput) => Promise<void>;
}

interface FormState {
  nombre: string;
  descripcion: string;
  direccion: string;
  telefono: string;
  latitud: number | null;
  longitud: number | null;
}

const emptyForm: FormState = {
  nombre: '',
  descripcion: '',
  direccion: '',
  telefono: '',
  latitud: null,
  longitud: null,
};

export default function BodegaSolicitudForm({
  bodega = null,
  submitting,
  onCancel,
  onSubmit,
}: BodegaSolicitudFormProps) {
  const isModification = Boolean(bodega);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm(bodega ? {
      nombre: bodega.nombre,
      descripcion: bodega.descripcion ?? '',
      direccion: bodega.direccion ?? '',
      telefono: bodega.telefono ?? '',
      latitud: bodega.latitud,
      longitud: bodega.longitud,
    } : emptyForm);
    setErrors({});
  }, [bodega]);

  const mapInitial = useMemo(() => ({
    address: form.direccion,
    latitude: form.latitud ?? -2.1894,
    longitude: form.longitud ?? -79.8891,
  }), [form.direccion, form.latitud, form.longitud]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: '', general: '' }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input: BodegaSolicitudInput = {
      tipo: isModification ? 'MODIFICACION' : 'ALTA',
      idDeposito: bodega?.id_deposito ?? null,
      ...form,
    };
    const nextErrors = validateBodegaInput(input);
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors as Record<string, string>);
      return;
    }
    await onSubmit(input);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="bodega-form-title" className="text-xl font-semibold text-slate-900">
            {isModification ? 'Solicitar modificación' : 'Solicitar nueva bodega'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {isModification
              ? 'Los cambios se aplicarán únicamente después de una nueva revisión.'
              : 'La bodega quedará disponible cuando el equipo operativo la apruebe. Su nombre se guardará con tu nombre o razón social.'}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar formulario">
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      {errors.general && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{errors.general}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bodega-nombre" className="mb-1 block text-sm font-medium text-slate-700">Nombre o referencia de la bodega</label>
          <input id="bodega-nombre" name="nombre" value={form.nombre} onChange={handleChange} maxLength={150} required aria-required="true" aria-invalid={Boolean(errors.nombre)} aria-describedby={errors.nombre ? 'bodega-nombre-error' : undefined} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          {errors.nombre && <p id="bodega-nombre-error" role="alert" className="mt-1 text-xs text-rose-600">{errors.nombre}</p>}
          {!isModification && <p className="mt-1 text-xs text-slate-500">Se guardará como: nombre de usuario o empresa - referencia ingresada.</p>}
        </div>
        <div>
          <label htmlFor="bodega-telefono" className="mb-1 block text-sm font-medium text-slate-700">Teléfono de contacto</label>
          <input id="bodega-telefono" name="telefono" type="tel" value={form.telefono} onChange={handleChange} maxLength={30} required aria-required="true" aria-invalid={Boolean(errors.telefono)} aria-describedby={errors.telefono ? 'bodega-telefono-error' : undefined} autoComplete="tel" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          {errors.telefono && <p id="bodega-telefono-error" role="alert" className="mt-1 text-xs text-rose-600">{errors.telefono}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="bodega-descripcion" className="mb-1 block text-sm font-medium text-slate-700">Descripción <span className="font-normal text-slate-500">(opcional)</span></label>
        <textarea id="bodega-descripcion" name="descripcion" value={form.descripcion} onChange={handleChange} maxLength={500} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
      </div>

      <div>
        <label htmlFor="bodega-direccion" className="mb-1 block text-sm font-medium text-slate-700">Dirección</label>
        <input id="bodega-direccion" name="direccion" value={form.direccion} onChange={handleChange} maxLength={250} required aria-required="true" aria-invalid={Boolean(errors.direccion)} aria-describedby={errors.direccion ? 'bodega-direccion-error' : undefined} autoComplete="street-address" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
        {errors.direccion && <p id="bodega-direccion-error" role="alert" className="mt-1 text-xs text-rose-600">{errors.direccion}</p>}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <MapPin aria-hidden="true" className="h-4 w-4 text-emerald-600" />
          <p className="text-sm font-medium text-slate-700">Ubicación en el mapa <span className="font-normal text-slate-500">(opcional)</span></p>
        </div>
        <MapboxLocationPicker
          initialAddress={mapInitial.address}
          initialLatitude={mapInitial.latitude}
          initialLongitude={mapInitial.longitude}
          onLocationSelect={({ address, latitude, longitude }) => setForm((previous) => ({
            ...previous,
            direccion: address,
            latitud: latitude,
            longitud: longitude,
          }))}
          ariaLabel="Buscar la dirección de la bodega en el mapa"
          placeholder="Busca la dirección de la bodega"
        />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
        <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
          <Save aria-hidden="true" className="h-4 w-4" />
          {submitting ? 'Enviando...' : 'Enviar solicitud'}
        </button>
      </div>
    </form>
  );
}
