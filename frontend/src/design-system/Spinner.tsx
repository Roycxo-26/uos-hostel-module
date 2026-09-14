export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={['animate-spin text-accent', className].join(' ')} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageSpinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

// Skeleton itself is the real, CLI-generated components/ui/skeleton —
// re-exported here (not reimplemented) so every design-system import stays
// a single `from '../design-system'` for pages that want it. Opt-in: no
// existing page uses it yet, available for any screen that wants a calmer
// "still loading" signal than a spinner for list/card-shaped content.
export { Skeleton } from '@/components/ui/skeleton';
