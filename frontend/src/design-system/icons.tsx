import {
  AlertTriangle,
  Bed,
  Bell,
  Building2,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  DoorOpen,
  Home,
  KeyRound,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Settings,
  User,
  UtensilsCrossed,
  WifiOff,
  Wrench,
  X,
  BarChart3,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

// Backed by lucide-react instead of hand-authored SVGs — same crisp,
// consistent-stroke icon language most premium product UIs (Linear,
// Vercel, Radix's own site) actually use, and one dependency instead of a
// hand-maintained SVG library. Every export keeps its EXACT original name
// so nothing else in the app needed to change — every page still imports
// `AlertIcon`/`ChevronRightIcon`/etc. from here or the design-system
// barrel exactly as before. Default size/stroke match the previous
// hand-drawn set's visual weight (20px, 1.75 stroke) so nothing shifted.

export type IconProps = LucideProps;

const defaults: Partial<LucideProps> = { size: 20, strokeWidth: 1.75 };

export function HomeIcon(props: IconProps) {
  return <Home {...defaults} {...props} />;
}
export function BuildingIcon(props: IconProps) {
  return <Building2 {...defaults} {...props} />;
}
export function ClipboardIcon(props: IconProps) {
  return <ClipboardList {...defaults} {...props} />;
}
export function BedIcon(props: IconProps) {
  return <Bed {...defaults} {...props} />;
}
export function SettingsIcon(props: IconProps) {
  return <Settings {...defaults} {...props} />;
}
export function MenuIcon(props: IconProps) {
  return <Menu {...defaults} {...props} />;
}
export function CloseIcon(props: IconProps) {
  return <X {...defaults} {...props} />;
}
export function ChevronRightIcon(props: IconProps) {
  return <ChevronRight {...defaults} {...props} />;
}
export function ChevronDownIcon(props: IconProps) {
  return <ChevronDown {...defaults} {...props} />;
}
export function CheckIcon(props: IconProps) {
  return <Check {...defaults} {...props} />;
}
export function AlertIcon(props: IconProps) {
  return <AlertTriangle {...defaults} {...props} />;
}
export function LogOutIcon(props: IconProps) {
  return <LogOut {...defaults} {...props} />;
}
export function UserIcon(props: IconProps) {
  return <User {...defaults} {...props} />;
}
export function PlusIcon(props: IconProps) {
  return <Plus {...defaults} {...props} />;
}
export function DoorIcon(props: IconProps) {
  return <DoorOpen {...defaults} {...props} />;
}
export function KeyIcon(props: IconProps) {
  return <KeyRound {...defaults} {...props} />;
}
export function UtensilsIcon(props: IconProps) {
  return <UtensilsCrossed {...defaults} {...props} />;
}
export function WrenchIcon(props: IconProps) {
  return <Wrench {...defaults} {...props} />;
}
export function ChartIcon(props: IconProps) {
  return <BarChart3 {...defaults} {...props} />;
}
export function MoreIcon(props: IconProps) {
  return <MoreHorizontal {...defaults} {...props} />;
}
export function BellIcon(props: IconProps) {
  return <Bell {...defaults} {...props} />;
}
// Frontline/offline support (12 Sep 2026).
export function CameraIcon(props: IconProps) {
  return <Camera {...defaults} {...props} />;
}
export function OfflineIcon(props: IconProps) {
  return <WifiOff {...defaults} {...props} />;
}
