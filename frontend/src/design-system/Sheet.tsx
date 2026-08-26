import type { ReactNode } from 'react';
import { CloseIcon } from './icons';

/**
 * The one create/edit-form container used everywhere. Mobile-first per the
 * user's brief: full-screen on small viewports (a form that has to be
 * usable one-handed on a phone doesn't get a cramped modal), a right-anchored
 * panel from the `sm` breakpoint up. This is deliberately not a centred
 * modal — a centred dialog is the thing that reads as a bootstrapped admin
 * template; an edge panel with a proper header/footer reads as a considered
 * one.
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
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="pt-safe pb-safe absolute inset-0 flex flex-col bg-white shadow-panel sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="border-t border-slate-200 px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>
  );
}
