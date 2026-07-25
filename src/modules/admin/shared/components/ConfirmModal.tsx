'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { Modal } from '@/app/components/ui/Modal';

type Variant = 'default' | 'danger' | 'warning';

type ConfirmModalProps = {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: Variant;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

const variantIcons: Record<Variant, { icon: ReactNode; className: string }> = {
  default: { icon: <Info className="h-5 w-5" />, className: 'bg-slate-100 text-slate-700' },
  warning: { icon: <AlertTriangle className="h-5 w-5" />, className: 'bg-amber-100 text-amber-800' },
  danger: { icon: <AlertTriangle className="h-5 w-5" />, className: 'bg-rose-100 text-rose-800' },
};

export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const icon = variantIcons[variant];

  return (
    <Modal open={open} onClose={onCancel} title={title} description={description} size="sm">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${icon.className}`} aria-hidden="true">
          {icon.icon}
        </span>
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button type="button" variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
