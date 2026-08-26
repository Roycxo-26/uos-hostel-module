import { types } from 'pg';

/**
 * Real bug, found live via SELF-TEST-GUIDE.md C8 — a headcount session
 * opened at 15:10 IST on 23 Aug 2026 came back from the API as
 * "2026-08-22T18:30:00.000Z", a full day-and-a-bit off from what was
 * actually inserted. Root cause: node-postgres's DEFAULT text parser for a
 * plain SQL `date` column (OID 1082, no time-of-day, no timezone at all)
 * builds the value with `new Date(year, month, day)` — the LOCAL-timezone
 * Date constructor. On a server whose system timezone is IST (this
 * machine), "midnight on the stored date" becomes a JS Date instant of
 * 18:30 UTC the PREVIOUS day. That instant then serializes correctly to
 * UTC via res.json()'s implicit toISOString() call — but "correctly" for
 * an instant that was wrong to construct in the first place, since a
 * calendar date has no instant to begin with. Every `t.date(...)` column in
 * this schema (headcount_sessions.session_date, hostels.effective_from/
 * effective_to) is affected identically, not just headcount.
 *
 * Fix: tell node-postgres to hand back the raw "YYYY-MM-DD" string for
 * `date` columns instead of ever constructing a Date object from it — the
 * only representation a pure calendar date should have, with nothing for a
 * timezone to shift. Global and process-wide by design (pg-types' type
 * parser registry isn't per-pool), so it must run before ANY query — hence
 * this file exists only to be imported first, before registry.ts or
 * anything else that might touch the database.
 */
types.setTypeParser(types.builtins.DATE, (value: string) => value);
