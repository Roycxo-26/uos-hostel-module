import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// flow.md §5.2 "Configure hostel structure": Super Admin/Admin (via the
// org_admin/is_super_admin bypass in requireHostelPermission) and Head
// Warden (via 'structure:configure' in the permission seed) get full
// access; Warden is "View/limited" — kept read-only here, matching this
// module's original Phase-1 scope.
export function structureRouter(): Router {
  const r = Router();
  const canConfigure = requireHostelPermission('structure:configure');

  r.get('/aliases', controller.resolveCodeAlias);
  r.get('/hostels', controller.listHostels);
  r.post('/hostels', canConfigure, controller.createHostel);
  r.get('/hostels/:hostelId', controller.getHostelTree);
  r.patch('/hostels/:hostelId', canConfigure, controller.updateHostel);

  r.post('/hostels/:hostelId/blocks', canConfigure, controller.createBlock);
  r.patch('/blocks/:blockId', canConfigure, controller.updateBlock);
  r.post('/blocks/:blockId/floors', canConfigure, controller.createFloor);
  r.patch('/floors/:floorId', canConfigure, controller.updateFloor);
  r.post('/floors/:floorId/rooms', canConfigure, controller.createRoom);
  r.patch('/rooms/:roomId', canConfigure, controller.updateRoom);
  r.patch('/rooms/:roomId/status', canConfigure, controller.updateRoomStatus);
  r.post('/rooms/:roomId/beds', canConfigure, controller.createBed);
  r.patch('/beds/:bedId', canConfigure, controller.updateBed);
  r.patch('/beds/:bedId/status', canConfigure, controller.updateBedStatus);

  return r;
}
