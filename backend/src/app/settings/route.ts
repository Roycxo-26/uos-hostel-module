import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

export function settingsRouter(): Router {
  const r = Router();

  r.get('/', controller.getSettings);
  // flow.md §5.2: configuration changes are an Admin/Super Admin capability
  // — no Hostel module role (Warden/Head Warden/Student) is granted
  // 'settings:manage' in the permission seed, so this only ever passes for
  // the org_admin/is_super_admin bypass in requireHostelPermission.
  r.patch('/', requireHostelPermission('settings:manage'), controller.updateSettings);

  return r;
}
