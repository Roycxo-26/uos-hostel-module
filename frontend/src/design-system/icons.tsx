import type { SVGProps } from 'react';

// Hand-authored, not pulled from an icon library — keeps the bundle small
// and every icon in the app sharing exactly one stroke weight/grid, which a
// mixed-source icon pack rarely gives you for free. 20x20 viewBox,
// currentColor throughout so icons inherit text colour (including in
// dark-mode-aware contexts later) without prop drilling a colour value.

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 9.5 10 3l7 6.5" />
      <path d="M5 8.5V16a1 1 0 0 0 1 1h3v-4.5h2V17h3a1 1 0 0 0 1-1V8.5" />
    </svg>
  );
}

export function BuildingIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="3" width="9" height="14" rx="1" />
      <path d="M13 8h3v9h-3M7 6.5h1M9.5 6.5h1M7 9.5h1M9.5 9.5h1M7 12.5h1M9.5 12.5h1" />
    </svg>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4.5" y="3.5" width="11" height="14" rx="1.5" />
      <path d="M7.5 3.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.5" />
      <path d="M7 9h6M7 12h6M7 15h3" />
    </svg>
  );
}

export function BedIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 15.5V7a1 1 0 0 1 1-1H10a1 1 0 0 1 1 1v2" />
      <path d="M2.5 12h15v3.5" />
      <path d="M11 9h6.5a1 1 0 0 1 1 1v2" />
      <circle cx="5.5" cy="8.25" r="1" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 3.5v1.3M10 15.2v1.3M16.5 10h-1.3M4.8 10H3.5M14.6 5.4l-.9.9M6.3 13.7l-.9.9M14.6 14.6l-.9-.9M6.3 6.3l-.9-.9" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 7.5 10 13l5.5-5.5" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10.5 8 14.5 16 6" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 3.5 17.5 16h-15L10 3.5Z" />
      <path d="M10 8.25v3.25M10 14v.01" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 3.5H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3" />
      <path d="M12.5 6.5 16.5 10l-4 3.5M16.5 10H7.5" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="7" r="3" />
      <path d="M3.5 16.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  );
}

// UOS HOSTEL BR.md §8 — Leave/Gate Pass/Headcount nav item.
export function DoorIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5h6a1 1 0 0 1 1 1V16h-8V4.5a1 1 0 0 1 1-1Z" />
      <path d="M5 16h10" />
      <circle cx="10.5" cy="10" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

// UOS HOSTEL BR.md §10 — Checkout nav item.
export function KeyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="6.5" cy="10" r="3" />
      <path d="M9 10h8M14.5 10v2.5M17 10v2.5" />
    </svg>
  );
}

// UOS HOSTEL BR.md §5 — Mess/Kitchen embedded-route placeholders.
export function UtensilsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5v6a1.5 1.5 0 0 0 3 0v-6M7.5 3.5v13M13.5 3.5c-1 1-1.5 2.5-1.5 4s.7 2.5 1.5 3v6" />
    </svg>
  );
}

// UOS HOSTEL BR.md §5 — Room Maintenance embedded-route placeholder.
export function WrenchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M13.5 4a3 3 0 0 0-3.9 3.9L4 13.5V16h2.5l5.6-5.6a3 3 0 0 0 3.9-3.9l-2 2-1.5-1.5 2-2Z" />
    </svg>
  );
}

// UOS HOSTEL BR.md §5 — Documents/Reports/Audit.
export function ChartIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 16.5h12" />
      <rect x="5.5" y="10.5" width="2.5" height="6" />
      <rect x="9" y="7" width="2.5" height="9.5" />
      <rect x="12.5" y="12.5" width="2.5" height="4" />
    </svg>
  );
}

// UOS HOSTEL BR.md §5.1 — "More" overflow menu (mobile bottom nav).
export function MoreIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="5" cy="10" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

// UOS HOSTEL BR.md §13/§14 — in-app notification tray.
export function BellIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5.5 8.5a4.5 4.5 0 0 1 9 0v3l1.3 2.2H4.2L5.5 11.5v-3Z" />
      <path d="M8.3 15.5a1.8 1.8 0 0 0 3.4 0" />
    </svg>
  );
}
