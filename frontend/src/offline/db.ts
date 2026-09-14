// Frontline/offline support (12 Sep 2026) — UOS_Final.docx audit
// §"ground and frontline worker mobile mode". True offline-first, not just
// "resilient to a flaky connection": an action taken with zero network
// (Floor Incharge walking a basement corridor, no signal) must still be
// captured on the device and delivered once connectivity returns. This is
// the local storage layer that makes that possible — a small, hand-rolled
// IndexedDB wrapper (no external dependency; the native API is small
// enough for the two object stores this actually needs).
//
// Two stores:
//  - `outbox`: queued actions not yet confirmed by the server. One row per
//    action, in the order it was taken — replayed in that same order by
//    syncManager.ts, since e.g. "start work" must reach the server before
//    "resolve" for the same ticket.
//  - `cache`: last-known-good read data (a Floor Incharge's own assigned
//    job list, an in-progress drill roster) so the Frontline screens have
//    something real to show even before the first successful sync of a
//    session, not just a blank "offline" screen.

const DB_NAME = 'hostel-frontline';
const DB_VERSION = 1;
const OUTBOX_STORE = 'outbox';
const CACHE_STORE = 'cache';

export type OutboxStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

export interface OutboxAction {
  /** Client-generated, stable across retries — doubles as the
   * Idempotency-Key sent to the server (see middlewares/idempotency.ts). */
  localId: string;
  /** Which Frontline screen this belongs to — purely for display grouping
   * ("3 pending in Maintenance"), the sync manager itself treats every
   * domain identically. */
  domain: 'maintenance' | 'roomAccess' | 'safety';
  /** Short, human label for the pending-sync list, e.g. "Start work on
   * ticket #1234" — written once at enqueue time rather than derived
   * later, since deriving it later would need the same lookups the
   * original action already had in scope. */
  label: string;
  method: 'POST' | 'PATCH';
  path: string;
  body: unknown;
  status: OutboxStatus;
  /** Set once a sync attempt actually fails — shown to the user so a
   * 'conflict'/'failed' entry isn't just a mystery. */
  errorMessage?: string;
  createdAt: number;
}

export interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  fetchedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'localId' });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open offline database'));
  });
}

function runTx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error(`IndexedDB ${storeName} operation failed`));
      })
  );
}

export async function addOutboxAction(action: OutboxAction): Promise<void> {
  await runTx(OUTBOX_STORE, 'readwrite', (store) => store.add(action));
}

export async function listOutboxActions(): Promise<OutboxAction[]> {
  const all = await runTx<OutboxAction[]>(OUTBOX_STORE, 'readonly', (store) => store.getAll() as IDBRequest<OutboxAction[]>);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateOutboxAction(localId: string, patch: Partial<OutboxAction>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    const store = tx.objectStore(OUTBOX_STORE);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const existing = getReq.result as OutboxAction | undefined;
      if (!existing) return resolve();
      const putReq = store.put({ ...existing, ...patch });
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function removeOutboxAction(localId: string): Promise<void> {
  await runTx(OUTBOX_STORE, 'readwrite', (store) => store.delete(localId));
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  await runTx(CACHE_STORE, 'readwrite', (store) => store.put({ key, data, fetchedAt: Date.now() } satisfies CacheEntry<T>));
}

export async function getCache<T>(key: string): Promise<CacheEntry<T> | undefined> {
  return runTx<CacheEntry<T> | undefined>(CACHE_STORE, 'readonly', (store) => store.get(key) as IDBRequest<CacheEntry<T> | undefined>);
}
