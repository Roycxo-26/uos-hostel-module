# Hostel Management Module — UOS Platform Migration

Two prior docs are still relevant, in order: [`flow.md`](flow.md) (the business/architecture reference built from the rule book) and `uos-module-developer-bundle/` (the platform contract this backend now follows — `FOR_YOUR_CLAUDE_CODE.md` and `uos-module-template/` specifically). This README covers what changed to get from a standalone Phase-1 app to a real UOS platform module, and exactly how to run it today.

## What changed, in one paragraph

The backend no longer owns its own database, auth, or tenant concept. It's now one deployment of `@uos/auth`'s multi-tenant pattern — every university gets its own physically separate Postgres database, login/JWT verification is the platform's job, and this module owns only its `hostel` schema inside each tenant database. The frontend authenticates against that same model: no backend-issued dev tokens, a real `AuthUser` shape from a signed JWT, and role information split between the platform (`org_role`, `is_super_admin`) and this module's own roles (Head Warden/Warden/Student, stored in `hostel.user_roles`).

## Run it — standalone dev mode

There is no live auth-server available yet, so this runs in the template's **standalone dev mode**: real Postgres, real Redis, real RLS, a self-signed local JWT instead of a live login. Same code paths as production (`requireAuth`, `scopedRequest`, `getTrx`, the permission layer) — only the tenant registry's config source changes. This has now been run and verified for real end-to-end, including against the real `@uos/auth` package — see [Verified live](#verified-live) below.

### 1. Postgres + Redis

```bash
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name hostel-pg postgres:16-alpine
docker run -d -p 6379:6379 --name hostel-redis redis:7-alpine
```

### 2. Database + this module's two roles

```bash
docker exec -e PGPASSWORD=postgres hostel-pg psql -U postgres -c "CREATE DATABASE hostel_dev;"
docker exec -e PGPASSWORD=postgres hostel-pg psql -U postgres -c "CREATE ROLE hostel_app WITH LOGIN PASSWORD 'hostel_app_dev_password';"
docker exec -e PGPASSWORD=postgres hostel-pg psql -U postgres -c "CREATE ROLE hostel_admin WITH LOGIN PASSWORD 'hostel_admin_dev_password';"
```

### 3. Schema + grants (normally `ensureModuleSchema` on the auth server does this — standalone mode has no live server to run it, so it's manual here only)

```bash
docker exec -e PGPASSWORD=postgres hostel-pg psql -U postgres -d hostel_dev -c "
  REVOKE ALL ON SCHEMA public FROM PUBLIC;
  CREATE SCHEMA IF NOT EXISTS hostel;
  GRANT USAGE, CREATE ON SCHEMA hostel TO hostel_admin;
  GRANT USAGE ON SCHEMA hostel TO hostel_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE hostel_admin IN SCHEMA hostel GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hostel_app;
  GRANT CREATE ON DATABASE hostel_dev TO hostel_admin;
"
```

> **Found running this for real, not in the template's own instructions:** that last `GRANT CREATE ON DATABASE` line. Migration `20260101000001` runs `CREATE SCHEMA IF NOT EXISTS hostel` — and Postgres checks whether you're *allowed* to create a schema before it checks whether one already exists, so even with the schema already in place, the first migration fails with `permission denied for database` without this grant. `CREATE ON SCHEMA` (line 4 above) is a different, narrower permission than `CREATE ON DATABASE` — both are needed.

### 4. Backend env + throwaway keypair

```bash
cd backend
cp .env.example .env   # defaults already match steps 1-3; edit only if you changed a password
npm install
npm run keys:generate
```

> **Real bug, found running this for real:** `package.json` originally pinned `@uos/auth` to `github:SuperCXO/uos-auth-package#feat/two-token-flow` (per the bundle docs at the time this module was built). That branch no longer exists on the repo — it was merged into `main` and deleted at some point since. `npm install` fails with `pathspec 'feat/two-token-flow' did not match any file(s) known to git` if you ever see this again after a `git fetch`/branch change upstream; confirm with `git ls-remote --heads --tags git@github.com:SuperCXO/uos-auth-package.git` and repoint the dependency at whatever ref actually exists (currently `main`).

### 5. Boot, migrate, seed

```bash
npm start
# Ctrl+C once it logs "migrated 1 known tenant(s)" and "listening on :3001" —
# migrations run automatically on every boot (registry.migrateAll()); this
# first run also creates the hostel schema's tables.
npm run seed:up
# runs both seeds: 001 (role_levels/role_permissions — real data, safe in
# any mode) and 002 (shadow_users/shadow_campuses/user_roles test personas —
# standalone-only, self-guarding via DEV_STANDALONE)
npm start
```

### 6. Mint a token per persona and sign in

```bash
npm run mint:head-warden
npm run mint:warden
npm run mint:student
npm run mint:org-admin
```

(The Hostel-module role — Head Warden/Warden/Student — comes from `hostel.user_roles`, seeded in step 5, not from `--role`/`org_role` on the token, which is only the platform-level claim.)

> **Real bug, found running this for real (PowerShell on Windows):** the original form of this command — `npm run dev:mint-token -- --user-id=... --role=...` — silently drops the flags after `--` in some PowerShell/npm combinations. The script then falls back to its hardcoded defaults (`user-id=...0001`, `role=org_admin`) with no error, so you'd sign in expecting one persona and get Org Admin every time, no matter which `--user-id` you typed. Confirmed by decoding the resulting JWT — every claim matched the script's defaults exactly. Fixed by adding the four `mint:*` scripts above, which bake the flags directly into `package.json` so there's no runtime argument-forwarding to fail. `npm run dev:mint-token -- --user-id=<uuid> --role=<role>` still exists for a one-off custom user-id/role combination — on Windows/PowerShell, prefer `npx ts-node scripts/dev-mint-token.ts --user-id=... --role=...` (bypassing `npm run --` entirely) over the `npm run ... --` form if you need one.

### 7. Frontend

```bash
cd frontend
cp .env.example .env    # VITE_API_BASE_URL=http://localhost:3001, already correct
npm install
npm run dev              # http://localhost:5173
```

Paste a minted token on the login screen. Try the Org Admin persona first (`GET /settings`, `POST /structure/hostels` all work for it via the platform-admin bypass), then Head Warden to build out blocks/floors/rooms/beds, then a Student to submit an application, then Warden to decide it, allocate, and check in.

## Verified live

Collaborator access to `SuperCXO/uos-auth-package` was resolved and the real package has now been installed, typechecked, and run — not just the database layer this time, the actual server, against the actual `@uos/auth` code:

- `npm install` — real `@uos/auth@1.0.0` in `node_modules`, both stopgap type files deleted (`backend/src/types/uos-auth-stub.d.ts`, `express-augment.d.ts` — the real package ships its own `declare global` Express augmentation, so the local one would've conflicted).
- `npm run typecheck` — clean. One real mismatch found and fixed: the hand-transcribed `AdminUserRole` had `isActive` (should be `active`) and was missing `grantedAt` entirely. Fixed in `backend/src/app/admin/service.ts` (mapped to `user_roles.updated_at`, which reflects the most recent grant, not `created_at`) and mirrored in `frontend/src/types/index.ts` (the frontend can't import the package's type directly).
- `npm start` — real boot. Logged `assertRlsRole OK — connected as: hostel_app`, `assertBootConditions OK`, `migrated 1 known tenant(s)`, `listening on :3001` — all from the real package, not a stub.
- `npm run dev:mint-token` → `GET /me` with the real token — returned real data (`"Dev Org Admin"` / `orgadmin@dev.local`, joined from `shadow_users`), proving real JWT verification, real `scopedRequest`, and a real RLS transaction end-to-end for the first time.

Everything in `backend/src/` — the DB schema, migrations, RLS policies, the business logic, the frontend — was already real and typechecked; this closes the one remaining gap (the package itself) and proves the full request path actually works, not just compiles.

## What's inferred vs. verified

| Area                                                                                                                | Status                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration runbook (§4 of `FOR_YOUR_CLAUDE_CODE.md`)                                                                 | Followed step by step — package.json, env vars, registry/db proxy, migrations schema-qualified with `shadow_users`/`shadow_campuses` FKs, module-local roles in their own table, structural error handler, `req.user` shape in controllers.                                                                  |
| Standalone dev mode                                                                                                 | Followed exactly against the template's own `src/config/env.ts`, `registry.ts`, `index.ts`, and both `scripts/dev-*` files — copied, not reimplemented from prose.                                                                                                                                           |
| RLS                                                                                                                 | Applied per-table (org\_id, or org\_id+campus\_id) on every business table, matching the template's `example_items` pattern — chosen consistently, not mixed with explicit filtering, per the template's own "pick one per table" rule.                                                                      |
| Required admin endpoints                                                                                            | Built at the exact required paths (`GET/POST/DELETE /api/admin/users...`), call `assertCanGrant` + `invalidatePermissions` as required — `AdminUserRole`'s field mapping is now confirmed against the real package's types (see [Verified live](#verified-live)).                                            |
| Full request path (`requireAuth` → `scopedRequest` → RLS transaction → repository → response)                       | **Verified live** — real server boot, real minted token, real `GET /me` response joined from `shadow_users`. See [Verified live](#verified-live).                                                                                                                                                            |
| §8 live-infra verification (real tenant provisioning, real cross-tenant isolation test, concurrent-write race test) | **Not done** — needs a live auth-server, which doesn't exist yet (see next section). Standalone mode proves the request path end-to-end against real Postgres/Redis; it does not prove multi-tenant provisioning, sync, or cross-tenant isolation, because none of those exist in standalone mode by design. |

## Still needed before this is genuinely production-ready

From the bundle's own §5 ("Cluster bootstrap you need to request"), unchanged by anything in this session:

1. `hostel_app` / `hostel_admin` Postgres roles created **once, cluster-wide** on the real platform (standalone mode's roles are local-only, throwaway).
2. This module registered in the auth server's `modules` table, for a real `MODULE_ID`.
3. `INTERNAL_SYNC_SECRET` matching the auth server's.
4. Then the full §8 verification pass — a real tenant provisioned, real login → select-module → scoped JWT, a genuine cross-campus RLS test, and `checkCrossTenantIsolation`.

(Real `@uos/auth` package access — previously item 4 here — is done; see [Verified live](#verified-live).)

## Carried forward from the earlier Phase-1 review (still true)

- **Attendance, Gate Pass/Leave, Visitor, Sports, Medical, Special Diet, Transfer, Temporary Relocation** — schema stub only (`attendance_responsibility_assignments`) or not started at all. See `flow.md` §17.
- **Mess** (`UOS-137`–139) isn't specified to the same depth as Hostel core in the source rule book — if it's in scope, it needs its own equivalent rule book.
- **Real UX design pass** — every screen is still this session's own design against the rule book's text, not an implemented, approved wireframe.
- **Business-owner sign-off** — not obtained.
- **Tests** — none yet, for either the state-machine logic or the RBAC/RLS boundary — the exact kind of thing the bundle's own §7 bug list says only shows up under real concurrent requests and real malformed input, not code review.
