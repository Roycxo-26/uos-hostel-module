import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { requireAuth, scopedRequest } from '@uos/auth';
import { registry } from './registry';
import { redis } from './redis';
import { errorHandler } from './middlewares/errorHandler';
import { exampleRouter } from './app/example';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check — no auth required
  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', module: process.env.MODULE_NAME })
  );

  // ─── Auth + RLS — apply to all routes below ───────────────────────────────
  //
  // requireAuth:    verifies JWT (RS256), populates req.user, checks revocation
  //                 via Redis. module_id is required — without it, a scoped
  //                 token issued for a DIFFERENT module would be silently
  //                 accepted here (the check that rejects it never runs).
  // scopedRequest:  resolves req.user.org_id -> tenant DB via the registry,
  //                 wraps each request in a transaction with RLS context set
  //                 (org_id + campus_id). Use getTrx() in controllers.
  //
  const publicKey = fs.readFileSync(process.env.AUTH_PUBLIC_KEY_PATH!, 'utf8');
  app.use(requireAuth({ publicKey, module_id: process.env.MODULE_ID!, redis }));
  app.use(scopedRequest(registry));

  // ─── Feature routes ───────────────────────────────────────────────────────
  // Rename 'example' to your feature (e.g. 'tickets', 'seats', 'invoices').
  app.use('/example', exampleRouter());

  // 404
  app.use((_req, res) =>
    res.status(404).json({ success: false, error: 'Not found' })
  );

  // Error handler — must be last
  app.use(errorHandler);

  return app;
}
