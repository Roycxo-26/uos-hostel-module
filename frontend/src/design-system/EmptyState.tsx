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
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center">
      {icon && <div className="mb-1 text-slate-400">{icon}</div>}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-xs text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
