import type { ReactNode } from 'react';
import { AlertIcon } from './icons';

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'warning'; children: ReactNode }) {
  const toneClasses = tone === 'danger' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200';
  return (
    <div className={['flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm', toneClasses].join(' ')}>
      <AlertIcon className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
