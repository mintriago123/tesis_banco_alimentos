/** Campo de texto estándar para formularios de autenticación. */

import type { ChangeEvent } from 'react';
import { FormField, TextInput } from '@/app/components/ui/FormField';

interface AuthInputProps {
  readonly id: string;
  readonly name: string;
  readonly type?: 'text' | 'email' | 'password';
  readonly label: string;
  readonly placeholder?: string;
  readonly value: string;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly required?: boolean;
  readonly autoComplete?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly disabled?: boolean;
}
export function AuthInput({
  id,
  name,
  type = 'text',
  label,
  placeholder,
  value,
  onChange,
  required = false,
  autoComplete,
  minLength,
  maxLength,
  disabled = false,
}: AuthInputProps) {
  return (
    <FormField id={id} label={label} required={required}>
      <TextInput
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        disabled={disabled}
        className="min-h-11 px-4"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    </FormField>
  );
}
