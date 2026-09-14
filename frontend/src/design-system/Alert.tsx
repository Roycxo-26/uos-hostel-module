import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Alert as ShadcnAlert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { AlertIcon, CheckIcon } from './icons';

type Tone = 'danger' | 'warning' | 'success' | 'info';

// Every colour reference here is CSS-variable-backed (see index.css) —
// this already renders correctly in dark mode with no extra work.
const toneClasses: Record<Tone, string> = {
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
};

const toneIcon: Record<Tone, ReactNode> = {
  danger: <AlertIcon />,
  warning: <AlertIcon />,
  success: <CheckIcon />,
  info: <AlertIcon />,
};

/**
 * Built on the real, CLI-generated `components/ui/alert` — its own
 * `has-[>svg]` grid layout is what lines the icon and text up into two
 * columns automatically, but ONLY when the <svg> is a direct child of the
 * Alert element (that's what the `>` in `has-[>svg]` means) — wrapping the
 * icon in a <span> here silently defeated it: the grid never switched on,
 * so the icon stacked above the text full-width instead of sitting beside
 * it. The icon renders directly for that reason; Alert's own base classes
 * already handle its size/row-span/vertical alignment once it does.
 */
export function Alert({ tone = 'danger', children }: { tone?: Tone; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // Every error/warning banner in the app goes through this one component
  // — so this one effect is what fixes "the error appeared, but it's
  // above/below the fold and the user has no idea anything happened"
  // everywhere at once, not page by page. This app's own pages already
  // clear `error` to null before every submit attempt (setError(null),
  // then setError(...) again only on failure), so a fresh error always
  // means Alert genuinely remounts — which is exactly what this effect's
  // empty dependency list needs to fire correctly on every new error, not
  // just the first one. `block: 'nearest'` scrolls the *least* amount
  // needed to bring it fully into view from wherever the panel currently
  // sits, in whichever direction that is, rather than always jumping to
  // the top.
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, []);

  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <ShadcnAlert className={cn('items-start py-2.5', toneClasses[tone])}>
        {toneIcon[tone]}
        <AlertDescription className="text-current">{children}</AlertDescription>
      </ShadcnAlert>
    </motion.div>
  );
}
