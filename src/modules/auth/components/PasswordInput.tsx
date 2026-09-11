/** Campo de contraseña con control accesible para mostrar u ocultar el valor. */

import { useState, type ChangeEvent } from 'react';
import { FormField, TextInput } from '@/app/components/ui/FormField';

interface PasswordInputProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly value: string;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly required?: boolean;
  readonly autoComplete?: string;
  readonly minLength?: number;
  readonly disabled?: boolean;
}
export function PasswordInput({
  id,
  name,
  label,
  placeholder = '••••••••',
  value,
  onChange,
  required = false,
  autoComplete,
  minLength,
  disabled = false,
}: PasswordInputProps) {
  const [verPassword, setVerPassword] = useState(false);

  return (
    <FormField id={id} label={label} required={required}>
      <div className="relative">
        <TextInput
          id={id}
          name={name}
          type={verPassword ? 'text' : 'password'}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          disabled={disabled}
          className="min-h-11 px-4 pr-12"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg p-0 text-slate-500 hover:bg-slate-100 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          onClick={() => setVerPassword((value) => !value)}
          aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={verPassword}
        >
          <svg
            className={`block h-5 w-5 ${verPassword ? 'text-blue-700' : 'text-slate-400'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </FormField>
  );
}
