'use client';

import type { HTMLAttributes, ReactNode } from 'react';

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  readonly muted?: boolean;
}

export function Surface({ children, muted = false, className = '', ...props }: SurfaceProps) {
  return (
    <div {...props} className={`rounded-2xl border border-slate-200 shadow-sm ${muted ? 'bg-slate-50' : 'bg-white'} ${className}`}>
      {children}
    </div>
  );
}

export const Card = Surface;

