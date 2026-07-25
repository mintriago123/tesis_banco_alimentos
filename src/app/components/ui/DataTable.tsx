'use client';

import type { ReactNode } from 'react';

interface DataTableProps {
  readonly caption?: string;
  readonly children: ReactNode;
}

export function DataTable({ caption, children }: DataTableProps) {
  return (
    <div className="table-surface">
      <div className="table-scroll">
        <table className="table-base text-left text-sm text-slate-700">
          {caption && <caption className="sr-only">{caption}</caption>}
          {children}
        </table>
      </div>
    </div>
  );
}
