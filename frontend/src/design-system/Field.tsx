import { Children, isValidElement } from 'react';
import type { ChangeEvent, LabelHTMLAttributes, OptionHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { Label as ShadcnLabel } from '@/components/ui/label';
import { Select as ShadcnSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export { Input } from '@/components/ui/input';
export { Textarea } from '@/components/ui/textarea';

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
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <ShadcnLabel {...props} />;
}

interface OptionEntry {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

/** Every existing call site passes plain `<option>` children (23 pages,
 * 136 instances) — this walks them into the shape a real Radix listbox
 * needs instead of requiring every page to be rewritten onto
 * `<SelectItem>`. Anything that isn't a literal `<option>` (a stray
 * `false`/`null` from a conditional, for instance) is just skipped. */
function extractOptions(children: ReactNode): OptionEntry[] {
  const options: OptionEntry[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionHTMLAttributes<HTMLOptionElement>>(child) || child.type !== 'option') return;
    options.push({
      value: child.props.value != null ? String(child.props.value) : '',
      label: child.props.children,
      disabled: child.props.disabled,
    });
  });
  return options;
}

// Radix's own Select.Item forbids an empty-string value outright (throws
// at runtime) — but this app's established convention uses
// `<option value="">All statuses</option>`-style entries as a REAL,
// re-selectable choice (e.g. "clear this filter"), not only as a
// placeholder a user can never navigate back to. A native <select> lets
// someone reopen the list and click that first option again at any time;
// silently dropping it from the list (an earlier version of this adapter
// did exactly that) would have quietly removed that ability. So every
// `<option>`, empty value included, becomes a real SelectItem — this
// sentinel is the empty option's actual Radix value, translated back to
// '' on the way out through onChange.
const EMPTY_VALUE = '__uos_select_empty__';

/**
 * A real Radix listbox now (components/ui/select), not a native <select> —
 * a native dropdown's own popup is rendered by the OS/browser and can't be
 * restyled (no custom cursor, no theme colours, no hover state), which is
 * exactly what made native selects the one part of the app that couldn't
 * be fixed to feel consistent. This adapter keeps every existing page's
 * exact call shape (`<Select value={} onChange={(e) => ...}><option
 * value="x">X</option>…</Select>`) so none of the 136 call sites had to
 * change.
 */
export function Select({
  value,
  onChange,
  children,
  className,
  id,
  disabled,
  required,
  name,
  'aria-label': ariaLabel,
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = extractOptions(children);
  const hasEmptyOption = options.some((o) => o.value === '');
  const currentValue = value == null || value === '' ? (hasEmptyOption ? EMPTY_VALUE : undefined) : String(value);

  return (
    <ShadcnSelect
      value={currentValue}
      onValueChange={(next) => onChange?.({ target: { value: next === EMPTY_VALUE ? '' : next } } as unknown as ChangeEvent<HTMLSelectElement>)}
      disabled={disabled}
      required={required}
      name={name}
    >
      <SelectTrigger id={id} className={className} aria-label={ariaLabel}>
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || EMPTY_VALUE} value={o.value === '' ? EMPTY_VALUE : o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </ShadcnSelect>
  );
}
