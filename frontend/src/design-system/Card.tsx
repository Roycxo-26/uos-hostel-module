import type { HTMLAttributes } from 'react';

type Tone = 'default' | 'warning' | 'info';

// Deliberately a closed `tone` enum rather than accepting an arbitrary
// className override for colour — two Tailwind border-colour utilities on
// the same element race on generation order, not source order, which is
// exactly the kind of subtle bug that makes an app look inconsistent for
// reasons nobody can immediately explain. `className` here is for layout
// only (margin, grid placement), never for re-colouring the card.
// 'info' added for D17.03 (Batch 14) — a time-sensitive but non-alarming
// highlight (a pending bed offer), same sky palette StatusPill's own
// 'info' tone already uses elsewhere.
const toneClasses: Record<Tone, string> = {
  default: 'border-slate-200',
  warning: 'border-amber-200',
  info: 'border-sky-200',
};

export function Card({ tone = 'default', className = '', ...props }: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return <div className={['rounded-lg border bg-white', toneClasses[tone], className].join(' ')} {...props} />;
}

export function CardHeader({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={['border-b border-slate-200 px-4 py-3 sm:px-5', className].join(' ')} {...props} />;
}

export function CardBody({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={['px-4 py-4 sm:px-5', className].join(' ')} {...props} />;
}
