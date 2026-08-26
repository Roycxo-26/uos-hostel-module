import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { requireAuth, scopedRequest } from '@uos/auth';
import { registry } from './registry';
import { redis } from './redis';
import { camelCaseResponses } from './middlewares/camelCaseResponse';
import { noStoreResponses } from './middlewares/noStore';
import { errorHandler } from './middlewares/errorHandler';
import { settingsRouter } from './app/settings';
import { structureRouter } from './app/structure';
import { applicationsRouter } from './app/applications';
import { allocationsRouter } from './app/allocations';
import { checkinsRouter } from './app/checkins';
import { transfersRouter } from './app/transfers';
import { responsibilitiesRouter } from './app/responsibilities';
import { movementsRouter } from './app/movements';
import { headcountRouter } from './app/headcount';
import { casesRouter } from './app/cases';
import { checkoutsRouter } from './app/checkouts';
import { notificationsRouter } from './app/notifications';
import { safetyRouter } from './app/safety';
import { occupancyVerificationRouter } from './app/occupancyVerification';
import { roomAccessRouter } from './app/roomAccess';
import { commonAreasRouter } from './app/commonAreas';
import { grievancesRouter } from './app/grievances';
import { operationalNoticesRouter } from './app/operationalNotices';
import { auditRouter } from './app/audit';
import { adminRouter } from './app/admin';
import { meRouter } from './app/me';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(camelCaseResponses);
  app.use(noStoreResponses);

  // Health check — no auth required
  app.get('/health', (_req, res) => res.json({ status: 'ok', module: process.env.MODULE_NAME }));

  // ─── Auth + RLS — apply to all routes below ───────────────────────────────
  //
  // requireAuth:    verifies JWT (RS256), populates req.user, checks revocation
  //                 via Redis. module_id is required — without it, a scoped
  //                 token issued for a DIFFERENT module would be silently
  //                 accepted here (the check that rejects it never runs).
  // scopedRequest:  resolves req.user.org_id -> tenant DB via the registry,
  //                 wraps each request in a transaction with RLS context set
  //                 (org_id + campus_id). Use getTrx() (via src/db.ts's proxy
  //                 in this module's repositories) in controllers.
  //
  const publicKey = fs.readFileSync(process.env.AUTH_PUBLIC_KEY_PATH!, 'utf8');
  app.use(requireAuth({ publicKey, module_id: process.env.MODULE_ID!, redis }));
  app.use(scopedRequest(registry));

  // ─── Feature routes ───────────────────────────────────────────────────────
  // flow.md §17 build order: Structure -> Application -> Allocation -> Check-In.
  app.use('/me', meRouter());
  app.use('/settings', settingsRouter());
  app.use('/structure', structureRouter());
  app.use('/applications', applicationsRouter());
  app.use('/allocations', allocationsRouter());
  app.use('/checkins', checkinsRouter());
  app.use('/transfers', transfersRouter());
  app.use('/responsibilities', responsibilitiesRouter());
  app.use('/movements', movementsRouter());
  app.use('/headcount', headcountRouter());
  app.use('/cases', casesRouter());
  app.use('/checkouts', checkoutsRouter());
  app.use('/notifications', notificationsRouter());
  app.use('/safety', safetyRouter());
  app.use('/occupancy-verification', occupancyVerificationRouter());
  app.use('/room-access', roomAccessRouter());
  app.use('/common-areas', commonAreasRouter());
  app.use('/grievances', grievancesRouter());
  app.use('/operational-notices', operationalNoticesRouter());
  app.use('/audit', auditRouter());

  // Required by @uos/auth's spec ("Required admin API endpoints" — the
  // unified admin shell calls these at this exact path, not this module's
  // own /prefix convention).
  app.use('/api/admin', adminRouter());

  // 404
  app.use((_req, res) => res.status(404).json({ success: false, error: 'Not found' }));

  // Error handler — must be last
  app.use(errorHandler);

  return app;
}
