const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
} as const;

type Size = keyof typeof SIZE_CLASSES;

function getInitials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? '') + (words[words.length - 1]?.[0] ?? '')).toUpperCase();
}

/**
 * One component behind both the institution mark (sidebar/mobile header,
 * `shape="square"`) and the signed-in user's avatar (`shape="circle"`) —
 * initials on the tenant's own accent colour instead of a generic person/
 * building glyph. This is what makes two different universities' deployments
 * actually look like two different, deliberately-branded products rather
 * than the same grey icon with a different name label next to it.
 */
export function Avatar({
  label,
  size = 'md',
  shape = 'circle',
  className = '',
}: {
  label: string;
  size?: Size;
  shape?: 'circle' | 'square';
  className?: string;
}) {
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center bg-accent-subtle font-semibold text-accent',
        shape === 'circle' ? 'rounded-full' : 'rounded-lg',
        SIZE_CLASSES[size],
        className,
      ].join(' ')}
      aria-hidden="true"
    >
      {getInitials(label)}
    </span>
  );
}
