import { Placeholder } from '../design-system';
import { WrenchIcon } from '../design-system/icons';

// UOS HOSTEL BR.md §5.1: /hostel/maintenance — "Report room issue and
// track linked work order without exposing internal asset screens." Owned
// by Desk/Facilities/Assets. Distinct from the "Report a complaint" flow
// on /cases — a room/service complaint creates a linked Desk ticket
// already (see cases/service.ts); this route would be the dedicated
// maintenance-tracking view Facilities staff themselves use, not the
// resident-facing intake, which already exists.
export function Maintenance() {
  return (
    <Placeholder
      title="Room Maintenance"
      description="Work orders, inventory, and asset status."
      icon={<WrenchIcon className="h-6 w-6" />}
      owner="Desk / Facilities / Assets"
      brRef="BR §5.1 (/hostel/maintenance)"
    />
  );
}
