'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly closeOnOverlayClick?: boolean;
  readonly closeButtonDisabled?: boolean;
}

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, description, children, size = 'md', closeOnOverlayClick = true, closeButtonDisabled = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const sizeClasses = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-3xl' } satisfies Record<NonNullable<ModalProps['size']>, string>;

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const autofocus = dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]:not([disabled])');
    const focusable = autofocus ?? dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
    focusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const elements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.classList.add('overflow-hidden');
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('overflow-hidden');
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="presentation">
      {closeOnOverlayClick ? (
        <button type="button" className="absolute inset-0 cursor-default bg-slate-950/40 backdrop-blur-[2px]" aria-label="Cerrar ventana" onClick={onClose} />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 cursor-default bg-slate-950/40 backdrop-blur-[2px]" />
      )}
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={`relative max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl ${sizeClasses[size]}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-slate-950">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm text-slate-600">{description}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={closeButtonDisabled} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Cerrar ventana">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
