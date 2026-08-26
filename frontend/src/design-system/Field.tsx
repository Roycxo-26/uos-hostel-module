import { forwardRef } from 'react';
import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const controlClasses =
  'block w-full min-h-touch rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus-visible:border-accent disabled:bg-slate-50 disabled:text-slate-400';

// FieldWrapper is the one place label/error/hint layout is decided — every
// form on every screen looks the same because every form uses this instead
// of hand-rolling <label>/<input>/error markup per page.
export function FieldWrapper({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-sm text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input ref={ref} className={[controlClasses, className].join(' ')} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea ref={ref} className={[controlClasses, 'min-h-[6rem] py-2', className].join(' ')} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...props }, ref) => (
    <select ref={ref} className={[controlClasses, 'pr-8', className].join(' ')} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="block text-sm font-medium text-slate-700" {...props} />;
}
