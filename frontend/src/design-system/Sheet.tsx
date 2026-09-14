import type { ReactNode } from 'react';
import { Sheet as ShadcnSheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * The one create/edit-form container used everywhere — built on the real,
 * CLI-generated `components/ui/sheet` (Radix Dialog underneath: real focus
 * trapping, Escape-to-close, scroll locking, and its own CSS slide/fade
 * animation come for free). This adapter keeps the same four props every
 * page already calls it with.
 *
 * Mobile-first per the original brief, preserved on top of shadcn's own
 * default (which is a 75%-width panel on every viewport): full-screen
 * below `sm` — a form usable one-handed on a phone doesn't get a cramped
 * partial-width panel — a right-anchored panel with a fixed max width from
 * `sm` up.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <ShadcnSheet open={open} onOpenChange={(next) => !next && onClose()}>
      {/* Real bug found live via SELF-TEST-GUIDE.md Batch 24, in two
          layers — the min-w-0 fix below wasn't enough on its own:
          1. The upstream shadcn SheetContent's own default width class is
             `data-[side=right]:sm:max-w-sm` (a two-variant chain). Our
             override here was plain `sm:max-w-md` (one variant) — a
             DIFFERENT variant chain, so tailwind-merge's class-conflict
             resolution never recognised them as the same "slot" and kept
             BOTH in the compiled output; which one actually won in the
             browser came down to unrelated CSS source order, not intent.
             Matching the exact same variant chain (`data-[side=right]:`
             included) makes this override behave like an override.
          2. Even with the right max-width applying, nothing told this
             fixed-position panel to actually clip content that tries to
             be wider than it — a long, non-wrapping Select value or an
             unconstrained textarea doesn't grow the panel's own box, it
             just paints past its right edge, which is enough on its own
             to push the whole document into a horizontal scroll. Explicit
             overflow-x-hidden here is the real fix; min-w-0 below stays
             too, since it's the separate, correct fix for the flexbox
             "child won't shrink" failure mode. */}
      <SheetContent side="right" className={cn('pt-safe pb-safe overflow-x-hidden', 'data-[side=right]:w-full data-[side=right]:sm:max-w-md')}>
        <SheetHeader className="border-b border-border px-4 py-3 sm:px-5">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <SheetFooter className="border-t border-border px-4 py-3 sm:px-5">{footer}</SheetFooter>}
      </SheetContent>
    </ShadcnSheet>
  );
}
