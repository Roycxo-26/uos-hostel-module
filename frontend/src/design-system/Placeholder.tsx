import type { ReactNode } from 'react';
import { Card, CardBody } from './Card';
import { PageHeader } from './PageHeader';

/**
 * BR §5.1: "unified navbar with permission-aware integration placeholders"
 * is a literal Phase 1 exit-gate requirement, not just a nice-to-have — a
 * section with no functionality yet still needs to exist in the nav and
 * explain honestly what it will be and why it isn't live, rather than being
 * omitted (which would misrepresent scope) or a bare "Coming soon" (which
 * tells the user nothing useful). See ux-flow.md §1's Screen Map for the
 * same 🔲/✅ distinction applied here.
 */
export function Placeholder({
  title,
  description,
  icon,
  owner,
  brRef,
  internal = false,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  owner: string;
  brRef: string;
  /** true when Hostel itself owns this future feature (e.g. Reports) rather
   * than embedding another module — swaps the copy so it doesn't imply an
   * external system is what's missing. */
  internal?: boolean;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-subtle text-accent">{icon}</span>
          <p className="max-w-md text-sm text-slate-500">
            {internal ? (
              <>
                Not built yet — planned within this module (<span className="font-medium text-slate-700">{owner}</span>),
                per {brRef}.
              </>
            ) : (
              <>
                Not built yet. Owned by <span className="font-medium text-slate-700">{owner}</span>, embedded here per{' '}
                {brRef} — Hostel will display it inside this same shell without a second login once it exists, never
                redirect elsewhere.
              </>
            )}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
