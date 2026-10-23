# Implementation-session handoff

Goal and attempt: FND-C64-PERSONAL-GRACEFUL-SHUTDOWN-01 (automatic CODE finding 4321054353, P1), attempt 1
Human owner / executor resource: Davide (assignment relayed from P; packet sha256 `0b482107…`; handover
`P-C64-API-source-handover.json`) / Claude Code lane C (transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-19/sophia-task-revalidation`, branch
`fix/personal-graceful-shutdown-20261020-c64`, from Personal `5bf9ccd8241c73c6bebda740113c4eed386b2f19` (tree
`eca61136…`)
Writable scope: `apps/api/src/companion.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`,
`apps/api/src/personal-live.db.test.ts`, this record. No Studio, schema, migration, contract, name, runtime or
dependency change.
Runtime unit: own PostgreSQL 17.11 on 127.0.0.1:55499 (fresh, stopped after); the local provider double on ephemeral
127.0.0.1 ports; fake key. Not pushed.

## Finding, shown

- A turn's answer runs after its 202 (the routes detach it). The server's shutdown was `app.close`, then the model
  service's `dispose`, then `pool.end`, then exit, with nothing joining that run.
- On 5bf (C64-logs 10-), with the provider stream held open after the 202 (the call reserved, its request in flight):
  `app.close` resolved with 0 replies written, then dispose and `pool.end` ran. After the stream ended, the call was
  still `reserved` and the turn had no reply. One provider request.

## Correction

- `CompanionRunner` owns each accepted run as a promise, from its claim through the call, its cost, any kept answer,
  its reply and the next turn it chains.
- `close()` stops new admission and chaining (a turn not started stays pending, as it is), then awaits every run that
  is still going.
- `app.ts` registers it as an `onClose` hook, so `app.close()` waits for those answers before `server.ts` disposes the
  model service and ends the pool.
- `server.ts` runs one shutdown however many SIGINT/SIGTERM arrive.
- Bounded by the existing policies only: each call by `ANSWER_LIMIT_MS` (60 s; on expiry its unknown cost is held, as
  before) and each write by its existing few retries. Nothing is cut short, slept on or polled; no new grace period.
- If the platform kills the process sooner (its own grace, SIGKILL, a crash), uncommitted work can still be lost. The
  0078/0079 fences still prevent a second paid generation for that turn.

## Evidence (P's journal, `C64-logs/`)

- New case «finishes the accepted answer, its cost and its reply before the model service and the pool close».
  - Old 5bf: FAIL (10-). Order: POST 202, `app.close` with 0 replies, dispose, `pool.end`; usage `reserved`; 0
    replies; 1 request.
  - Fixed: PASS (20-). `app.close` resolved with the reply written; usage `settled`; 1 request.
- `personal-live` and `personal` DB files, serial: 55/55 (30-). oxlint 0, prettier ok, `tsc` API 0; companion unit
  file (43-).

## Not run / limits

- A real server process was not signalled: the server's order was run in-process, and `process.exit` itself was not
  executed.
- Not separately tested: repeated signals; a second pending turn not chained while closing; an uncooperative stream
  held past the 60 s limit; the database unavailable during the drain.
- Not run: the full DB aggregate, `pnpm check`, browser.
