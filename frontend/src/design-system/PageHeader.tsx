import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

// Every page in the app opens with this — title (+ optional description) on
// the left, one primary action on the right. Stacks on mobile so the action
// button never gets squeezed into an unreadable width next to a long title.
// `display` font + a small entrance animation is the one deliberate flourish
// repeated on every single screen, which is what makes it read as a
// consistent product rhythm rather than a one-off effect.
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground text-balance">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </motion.div>
  );
}
