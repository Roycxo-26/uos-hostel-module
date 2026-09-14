import { forwardRef } from 'react';
import type { ComponentProps } from 'react';
import { Button as ShadcnButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ShadcnButtonProps = ComponentProps<typeof ShadcnButton>;

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'link';
type Size = 'md' | 'sm' | 'icon';

const VARIANT_MAP: Record<Variant, ShadcnButtonProps['variant']> = {
  primary: 'default',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'destructive',
  outline: 'outline',
  link: 'link',
};

const SIZE_MAP: Record<Size, ShadcnButtonProps['size']> = {
  // "md"/"sm" are this app's own naming (kept so none of the 30 pages that
  // already call <Button size="sm"> etc. had to change) — flow.md §10.4's
  // 44px tap-target requirement is why "md" maps to the CLI-generated
  // button's own "touch" size rather than its much smaller default (see
  // components/ui/button.tsx's own comment on that size).
  md: 'touch',
  sm: 'sm',
  icon: 'icon-touch',
};

export interface ButtonProps extends Omit<ShadcnButtonProps, 'variant' | 'size'> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

/**
 * Every interactive control in the app routes through this. It's a thin
 * adapter over the real, CLI-generated `components/ui/button` — all
 * styling/variants/motion live there, this file only translates this
 * app's existing prop vocabulary (variant="danger", size="md", fullWidth)
 * onto shadcn's own (variant="destructive", size="touch", className) so
 * none of the ~150 existing call sites across 30 pages needed to change.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', fullWidth, className, ...props }, ref) => (
    <ShadcnButton
      ref={ref}
      variant={VARIANT_MAP[variant]}
      size={SIZE_MAP[size]}
      className={cn(fullWidth && 'w-full', className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
