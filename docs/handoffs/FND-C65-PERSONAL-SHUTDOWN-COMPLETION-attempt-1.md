# Implementation-session handoff

Goal and attempt: FND-C65-PERSONAL-SHUTDOWN-FOCUSED-COMPLETION-01 (R2-C64 HOLD on finding 4321054353), attempt 1
Human owner / executor resource: Davide (assignment relayed from P; packet sha256 `e5391e3a…`) / Claude Code lane C
(transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-19/sophia-task-revalidation`, branch
`fix/personal-shutdown-completion-20261020-c65`, from C64 `9e4aa75b836512b9348ef5cf36c4327f8b26d982` (frozen)
Writable scope: `apps/api/src/companion.ts`, `apps/api/src/companion-close.test.ts` (new), `personal-live.db.test.ts`,
this record. No Studio, schema, contract, name, runtime or dependency change. Not pushed.
Gate: no test ran before B98's sealed STOP. I verified it at 03:31:12Z (its STOP file and live ports); P verified it at
03:32:21Z.

## Corrections

- **Cleanup of an accepted run** (R2 P2): `answer()` handles both outcomes on the run itself, with no ignored
  `finally` child. An unexpected failure of the whole run is reported once through the runner's `onError` (the app logs
  only `companionFailure`: no words), never retried.
- A chained next turn's failure is reported by its own handler only (the parent no longer re-raises it).
- **The bound, stated honestly:** `close()` observes each run's end, not its success. A run may end with its cost held
  unknown, its answer kept but its reply unwritten, or failed. `close()` has no deadline of its own:
  - `ANSWER_LIMIT_MS` only signals the call to stop (cooperative);
  - writes retry a few times;
  - a call or query that never settles keeps shutdown waiting, with its resources open, until the platform ends the
    process.
  C64's handoff wording («bounded … nothing is cut short») is superseded by this.

## Controls (P's journal, `C65-logs/`)

1. **The actual server process** (`apps/api/src/server.ts` spawned on an owned ephemeral port, the live companion, the
   local double in the test).
   - POST 202, the stream held (a TIMED hold, `delayMs` 2500: the double has no manual gate), the call reserved, then
     a second turn accepted. SIGTERM, then SIGINT while held.
   - Old 5bf lifecycle files (30-): exit 0 in ~1.4 s; usage `reserved`; both turns pending; no reply.
   - Fixed (20-): exit 0 after the first reply was written and its cost settled; the queued turn stays pending (no
     chained paid call); 1 request.
2. **Barrier after the provider's result, before the final reply write** (in-process; a gate on
   `record_personal_(settled_)?reply`).
   - At the barrier: cost `settled`, answer kept. `app.close()` had not resolved while the write was held; then it
     resolved with 1 reply, `settled` and 1 request (21-).
   - The first run (20-) missed the gate, because the live path writes the reply from the kept answer with
     `record_personal_settled_reply`. That run hung and was stopped by PID (own processes only). Kept.
3. **An unexpected rejecting run** (`companion-close.test.ts`, no DB).
   - Old (`companion.ts` at 9e4, 10-): FAIL, an unhandled rejection.
   - Fixed (11-): reported once, nothing unhandled, close ends, nothing started after close.
- Personal DB files 57/57 (40-); units (41-); oxlint 0, `tsc` API 0, prettier ok.

## Not observed

- An uncooperative stream past 60 s, and the database unavailable during the drain: not run. The behaviour is as
  stated above (waits; the platform may kill).
- SIGKILL or process death still loses uncommitted work, as before.
