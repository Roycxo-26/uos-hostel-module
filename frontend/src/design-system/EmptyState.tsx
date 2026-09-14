import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

// flow.md's own UI standard (Master Rule Book §48.1) requires a designed
// empty state, not a blank list — this is that one component every list
// page reaches for instead of leaving "nothing here" implicit.
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center"
    >
      {icon && (
        <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-accent-subtle text-accent">{icon}</div>
      )}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </motion.div>
  );
}
