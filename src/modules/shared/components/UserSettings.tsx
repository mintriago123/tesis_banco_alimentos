'use client';

import React from 'react';
import { Alert } from '@/app/components';
import { Button } from '@/app/components/ui/Button';
import { FormField, TextInput } from '@/app/components/ui/FormField';
import { UserIcon, BellIcon, EyeIcon, EyeSlashIcon, KeyIcon } from '@heroicons/react/24/outline';
import { usePasswordChange } from '@/modules/shared/hooks/usePasswordChange';
import { useUserPreferences } from '@/modules/shared/hooks/useUserPreferences';
import { useMessage } from '@/modules/shared/hooks/useMessage';
import { changePasswordAction } from '@/modules/shared/actions/account';

type Props = {
  title?: string;
  description?: string;
  variant?: 'default' | 'donante' | 'solicitante';
  showHeader?: boolean;
  showPreferences?: boolean;
  showPasswordChange?: boolean;
};

export function UserSettingsContent({
  title = 'Configuración de Usuario',
  description = 'Gestiona tus preferencias personales y de cuenta',
  variant = 'default',
  showHeader = true,
  showPreferences = true,
  showPasswordChange = true,
}: Props) {
  const { preferences, updatePreference, savePreferences, isSaving: savingPreferences } = useUserPreferences();
  const { message, showSuccess, showError } = useMessage();
  const accent = variant === 'donante' ? 'donante' : variant === 'solicitante' ? 'solicitante' : 'institucional';
  const accentClasses = {
    icon: variant === 'donante' ? 'text-emerald-700' : variant === 'solicitante' ? 'text-blue-700' : 'text-emerald-700',
    activeToggle: variant === 'donante' ? 'bg-emerald-700' : 'bg-blue-700',
  };

  const {
    currentPassword,
    newPassword,
    confirmPassword,
    showPasswords,
    setCurrentPassword,
    setNewPassword,
    setConfirmPassword,
    togglePasswordVisibility,
    resetPasswords,
    validatePasswords,
  } = usePasswordChange();

  const handleSavePreferences = async () => {
    const success = await savePreferences();
    if (success) {
      showSuccess('Preferencias guardadas con éxito');
    } else {
      showError('Error al guardar preferencias');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validatePasswords();
    if (!validation.valid) {
      showError(validation.error || 'Error de validación');
      return;
    }

    const result = await changePasswordAction(currentPassword, newPassword);
    if (result.success) {
      showSuccess('Contraseña actualizada correctamente');
      resetPasswords();
    } else {
      showError(result.error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto" data-settings-variant={variant}>
      {showHeader && (
        <>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center mb-2">
            <UserIcon className={`mr-2 h-7 w-7 ${accentClasses.icon}`} />
            {title}
          </h1>
          <p className="text-gray-600 mb-6">{description}</p>
        </>
      )}

      {message && (
        <div className="mb-6">
          <Alert tipo={message.type} mensaje={message.text} />
        </div>
      )}

      {showPreferences && (
        <div className="mb-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center text-xl font-semibold text-slate-900">
            <BellIcon className={`mr-2 h-5 w-5 ${accentClasses.icon}`} />
            Preferencias
          </h2>

          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-gray-700">Recibir notificaciones por correo</p>
              <p className="text-xs text-gray-500">Activa o desactiva los emails automáticos del sistema</p>
            </div>
            <button
              onClick={() => updatePreference('recibir_notificaciones', !preferences.recibir_notificaciones)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                preferences.recibir_notificaciones ? accentClasses.activeToggle : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  preferences.recibir_notificaciones ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSavePreferences} disabled={savingPreferences} loading={savingPreferences} accent={accent}>
              Guardar preferencias
            </Button>
          </div>
        </div>
      )}

      {showPasswordChange && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 flex items-center text-xl font-semibold text-slate-900">
            <KeyIcon className={`mr-2 h-5 w-5 ${accentClasses.icon}`} />
            Cambiar Contraseña
          </h2>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            {(
              [
                ['current', 'Contraseña Actual', currentPassword, setCurrentPassword],
                ['new', 'Nueva Contraseña', newPassword, setNewPassword],
                ['confirm', 'Confirmar Contraseña', confirmPassword, setConfirmPassword],
              ] as [keyof typeof showPasswords, string, string, React.Dispatch<React.SetStateAction<string>>][]
            ).map(([field, label, value, setter]) => (
              <FormField key={field} id={`password-${field}`} label={label} required>
                <div className="relative">
                  <TextInput
                    id={`password-${field}`}
                    type={showPasswords[field] ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    className="min-h-11 px-4 pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility(field)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPasswords[field] ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
              </FormField>
            ))}

            <div className="flex justify-end">
              <Button type="submit" accent={accent}>
                Cambiar contraseña
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default UserSettingsContent;
