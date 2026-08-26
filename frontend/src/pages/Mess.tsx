import { Placeholder } from '../design-system';
import { UtensilsIcon } from '../design-system/icons';

// UOS HOSTEL BR.md §5.1: /hostel/mess — "Meal eligibility, plan, menu,
// attendance and resident feedback." Owned by UOS-137-138 Mess, a separate
// module; Hostel only ever sends entitlement/occupancy signals to it (see
// flow.md §1's boundary note — Special Diet lives here too, not as its own
// Hostel screen).
export function Mess() {
  return (
    <Placeholder
      title="Mess"
      description="Meal plan, menu, attendance, and special diet."
      icon={<UtensilsIcon className="h-6 w-6" />}
      owner="UOS-137–138 Mess"
      brRef="BR §5.1 (/hostel/mess)"
    />
  );
}
