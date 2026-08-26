import { Placeholder } from '../design-system';
import { UtensilsIcon } from '../design-system/icons';

// UOS HOSTEL BR.md §5.1: /hostel/kitchen — "Forecast, consumption, wastage,
// hygiene and procurement status for permitted staff." Owned by UOS-139
// Kitchen plus Inventory/Procurement; staff-only in practice, not a
// resident-facing screen.
export function Kitchen() {
  return (
    <Placeholder
      title="Kitchen"
      description="Consumption, wastage, hygiene, and procurement status."
      icon={<UtensilsIcon className="h-6 w-6" />}
      owner="UOS-139 Kitchen + Inventory/Procurement"
      brRef="BR §5.1 (/hostel/kitchen)"
    />
  );
}
