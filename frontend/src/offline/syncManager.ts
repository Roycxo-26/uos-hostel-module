import { API_BASE, getToken } from '../api/client';
import { addOutboxAction, listOutboxActions, removeOutboxAction, updateOutboxAction, type OutboxAction, type OutboxStatus } from './db';

// Frontline/offline support (12 Sep 2026) — replays the outbox against the
// real backend once (and while) online. Deliberately talks to the network
// directly with `fetch` rather than going through the typed api/*.ts
// client functions each domain already has: those don't take a custom
// Idempotency-Key header, and a generic {method, path, body} replay means
// this file never needs to know anything domain-specific — Maintenance,
// Room Access and Safety all replay through the exact same code path.

type Listener = (outbox: OutboxAction[]) => void;
const listeners = new Set<Listener>();
let syncing = false;

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  void listOutboxActions().then(listener);
  return () => listeners.delete(listener);
}

async function notify(): Promise<void> {
  const outbox = await listOutboxActions();
  for (const listener of listeners) listener(outbox);
}

/**
 * Queues an action and returns immediately — the caller shows it as
 * "pending sync" right away (optimistic UI) rather than waiting on a
 * network round trip that, offline, would never come. `localId` doubles
 * as the Idempotency-Key on the eventual real request.
 */
export async function enqueue(input: {
  domain: OutboxAction['domain'];
  label: string;
  method: OutboxAction['method'];
  path: string;
  body: unknown;
}): Promise<string> {
  const localId = crypto.randomUUID();
  await addOutboxAction({ ...input, localId, status: 'pending', createdAt: Date.now() });
  await notify();
  void trySync();
  return localId;
}

/**
 * Walks the outbox in creation order and replays each pending entry.
 * Stops at the first entry that fails for a network reason (offline
 * again, or the request genuinely couldn't reach the server) — the rest
 * stay queued for the next attempt, in the same order, rather than
 * reordering around a stuck entry. A 'conflict' or other rejected entry
 * is marked and skipped (not retried automatically) so it doesn't block
 * everything queued after it — surfaced to the user instead, same
 * reasoning as any other real error in this app.
 */
export async function trySync(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const outbox = await listOutboxActions();
    for (const action of outbox) {
      if (action.status !== 'pending') continue;
      await updateOutboxAction(action.localId, { status: 'syncing' });
      await notify();

      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}${action.path}`, {
          method: action.method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Idempotency-Key': action.localId,
          },
          body: action.body ? JSON.stringify(action.body) : undefined,
        });
        const body = (await res.json().catch(() => undefined)) as { success?: boolean; error?: string } | undefined;

        if (res.ok && body?.success) {
          await removeOutboxAction(action.localId);
        } else if (res.status === 409) {
          await updateOutboxAction(action.localId, { status: 'conflict', errorMessage: body?.error ?? 'This was already changed by someone else.' });
        } else if (res.status >= 400 && res.status < 500) {
          // A real, permanent rejection (validation error, no longer
          // allowed, etc.) — retrying it again unchanged would just fail
          // the same way forever, so it's marked 'failed' and skipped
          // rather than looped on.
          await updateOutboxAction(action.localId, { status: 'failed', errorMessage: body?.error ?? `Request failed (${res.status})` });
        } else {
          // Server-side (5xx) — worth retrying later, leave it pending.
          await updateOutboxAction(action.localId, { status: 'pending' });
          break;
        }
      } catch {
        // A thrown fetch means the network genuinely isn't there right
        // now (not a server response at all) — stop for this pass, the
        // 'online' listener or the next periodic check will try again.
        await updateOutboxAction(action.localId, { status: 'pending' });
        break;
      }
      await notify();
    }
  } finally {
    syncing = false;
    await notify();
  }
}

export async function discardOutboxAction(localId: string): Promise<void> {
  await removeOutboxAction(localId);
  await notify();
}

/** Puts a 'failed'/'conflict' entry back in the retry queue — used when a
 * user has resolved the underlying issue themselves (e.g. someone else's
 * conflicting change is fine to overwrite now) and wants to try again. */
export async function retryOutboxAction(localId: string): Promise<void> {
  await updateOutboxAction(localId, { status: 'pending' as OutboxStatus, errorMessage: undefined });
  await notify();
  void trySync();
}

let started = false;
/** Call once, at app startup — wires the 'online' event and a periodic
 * fallback poll (iOS Safari has no Background Sync API, so a plain
 * interval is the only reliable trigger there while the app is open). */
export function startSyncManager(): void {
  if (started) return;
  started = true;
  window.addEventListener('online', () => void trySync());
  setInterval(() => void trySync(), 20_000);
  void trySync();
}
