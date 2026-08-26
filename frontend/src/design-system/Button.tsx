import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95 disabled:opacity-50',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-50',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 disabled:opacity-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50',
};

const sizeClasses: Record<Size, string> = {
  md: 'min-h-touch px-4 text-sm',
  sm: 'h-9 px-3 text-sm',
};

// Every interactive control in the app routes through this — that's what
// keeps tap targets, focus rings and disabled states consistent instead of
// each screen inventing its own button styling (the fastest way an app ends
// up looking assembled rather than designed).
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', fullWidth, className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
