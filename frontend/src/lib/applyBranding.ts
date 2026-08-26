/**
 * Applies a tenant's chosen accent colour to the CSS variables index.css
 * defines defaults for. This is the actual mechanism behind "white-label" —
 * not a config screen that does nothing, a config screen that repaints the
 * app. Also picks a readable foreground colour automatically: a tenant is
 * free to choose any brand colour, including light ones, and white-on-white
 * text on every primary button would be a real accessibility failure, not
 * just an aesthetic one.
 */
export function applyBranding(primaryColorHex: string): void {
  const rgb = hexToRgb(primaryColorHex);
  if (!rgb) return;

  const root = document.documentElement.style;
  root.setProperty('--color-accent', primaryColorHex);
  root.setProperty('--color-accent-fg', relativeLuminance(rgb) > 0.45 ? '#0f172a' : '#ffffff');
  root.setProperty('--color-accent-subtle', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);

  // index.html hardcodes a fallback for the instant before this runs, but a
  // white-label deploy's browser chrome (mobile Safari/Chrome's address bar,
  // the PWA task switcher) should match THEIR colour once we know it, not
  // whatever tenant happened to be in index.html's static markup.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', primaryColorHex);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const int = parseInt(match[1] as string, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

// WCAG relative luminance, simplified (no gamma-correct linearisation) —
// good enough for a binary light/dark text decision, not for a contrast
// ratio compliance report.
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
