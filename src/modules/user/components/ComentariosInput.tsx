// ============================================================================
// Component: ComentariosInput
// Input de comentarios adicionales
// ============================================================================

import type { ChangeEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { FORM_CONFIG } from '../constants';
import { FormField, TextareaInput } from '@/app/components/ui/FormField';

interface ComentariosInputProps {
  comentarios: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
}

export function ComentariosInput({
  comentarios,
  onChange,
}: ComentariosInputProps) {
  return (
    <FormField id="comentarios" label="Comentarios adicionales" hint={`Máximo ${FORM_CONFIG.COMENTARIOS_MAX_LENGTH} caracteres`}>
      <div className="relative">
        <TextareaInput
          id="comentarios"
          value={comentarios}
          onChange={onChange}
          className="min-h-24 resize-y px-4 pl-12"
          placeholder="Describe detalles adicionales sobre tu solicitud..."
          rows={4}
          maxLength={FORM_CONFIG.COMENTARIOS_MAX_LENGTH}
        />
        <MessageCircle className="absolute left-3 top-4 h-5 w-5 text-gray-400" />
      </div>
    </FormField>
  );
}
