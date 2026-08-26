import { Request, Response, NextFunction } from 'express';
import { success } from '../../utils/response';
import { updateSettingsSchema } from './validators';
import * as service from './service';

// GET is intentionally open to any authenticated role with module access —
// every screen needs terminology/branding/feature flags to render
// correctly, not just Admin. requireAuth + scopedRequest (mounted globally
// in app.ts) already gate that far; no requireHostelPermission needed here.
export async function getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await service.getSettings(req.user.org_id);
    success(res, { settings });
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const patch = updateSettingsSchema.parse(req.body);
    const settings = await service.updateSettings(req.user, patch);
    success(res, { settings });
  } catch (err) {
    next(err);
  }
}
