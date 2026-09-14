import type { HTMLAttributes } from 'react';
import { Card as ShadcnCard, CardContent, CardHeader as ShadcnCardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'warning' | 'info';

// Deliberately a closed `tone` enum rather than accepting an arbitrary
// className override for colour — two Tailwind border-colour utilities on
// the same element race on generation order, not source order. 'info' —
// a time-sensitive but non-alarming highlight.
const toneClasses: Record<Tone, string> = {
  default: 'border-border',
  warning: 'border-amber-200',
  info: 'border-sky-200',
};

/**
 * Built on the real, CLI-generated `components/ui/card` (bg-card, rounded
 * corners, the subtle 1px ring shadcn's own Nova style uses instead of a
 * heavier border) — this file only adds this app's own `tone`/`interactive`
 * props and the simpler CardHeader/CardBody padding convention the ~8
 * existing pages using them already expect, overriding shadcn's own
 * fancier `--card-spacing` container-query sizing rather than duplicating
 * Card's actual surface styling from scratch.
 */
export function Card({
  tone = 'default',
  interactive = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: Tone; interactive?: boolean }) {
  return (
    <ShadcnCard
      className={cn(
        'border ring-0 py-0 shadow-soft transition-shadow duration-200',
        interactive && 'hover:shadow-card-glow',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <ShadcnCardHeader className={cn('border-b border-border px-4 py-3 sm:px-5', className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <CardContent className={cn('px-4 py-4 sm:px-5', className)} {...props} />;
}
