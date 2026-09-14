// Pure re-export of the real, CLI-generated primitive — see
// components/ui/dropdown-menu.tsx (hand-customized there: cursor-pointer
// instead of shadcn's own default cursor-default on menu items, and
// hover/focus highlight uses --muted rather than --color-accent so this
// app's one "accent" token keeps a single meaning — brand colour —
// everywhere instead of also meaning "hovered menu row"). Nothing to
// adapt here, so nothing is duplicated here.
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
