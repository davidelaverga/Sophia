# Implementation-session handoff

Goal and attempt: FND-B115-LAUNCHER-INPUT-LIFETIME-01, attempt 1. This addresses automatic CODE findings 4326076000
(root lease), 4326076019 (validated overlay lifetime) and 4326076035 (out-of-range ports) on `90fdd` (PR 474).
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `e19d89c6…`, R2 triage
proof `15a3ed80…`, and P scope addendum `a46e5a7f…` (read; no package edit was used).
Start: branch `fix/service-reply-launch-20261020-b105`, clean at `90fdd475` (tree `f7844ae7`). Not pushed.

## The correction (scripts only)

- `scripts/lib/root-lease.mjs` (new): print and launch take the root's lease BEFORE the profile is reconciled. A root a
  live runtime holds is refused, exit 2, and nothing under it changes.
  - It is the supervisor's own lease: the same `<root>/supervisor.lease` file, created exclusively and holding the
    pid. It is not a second lock, and it calls no private method.
  - The launched `RuntimeSupervisor` takes it over in place. Its `acquireLease` treats a lease holding its own
    process's pid as its own, so there is no unleased moment between reconciliation and start.
  - A dead holder's lease is replaced, as the supervisor replaces it. The host releases the lease at exit only while
    it still holds this pid.
- `scripts/lib/service-overlay.mjs`: `stageAdmittedOverlay` writes the admitted bytes, owner-only, to
  `<root>/service-overlay.admitted.json`, under the lease and exclusively. dsh reads that copy, never the operator's
  file, for the launch and for every supervisor restart. The copy is removed at exit.
- The loopback endpoint's port must be 1 to 65535.
- `scripts/runtime-host.mjs`: wires both in, logs the staged path (names only), and its header recipe states the lease
  and staging behaviour.
- Unchanged: B114's closed composition, the B108/B111 name guards, default OFF, exact loaded identity and no fallback.

## Evidence (journal `B115-logs/`)

- Old FAIL, with the final test bytes (10) on 90fdd source and own fresh PG17 port 55501 (11), exit 1, 0/3:
  - **Lease:** print on a drifted root whose lease holds a live pid reconciled it (`upgraded`) and exited 0.
  - **Overlay lifetime:** after the operator file was rewritten (bridge without replies) and the dsh child was killed,
    the restart loaded the rewritten file and the conversation role was gone.
  - **Port:** 65536 printed a digest.
- Fixed, same bytes (12): 12/12. The three B115 tests pass, alongside the B114/B111/B108/B105 refusals, the shipped
  positive (now through the restart), default OFF and the wrong digest.
- Whole service file, same PG (22): 37/37.
- `pnpm check` (30): exit 0 (unit 3612 pass / 0 fail; integration 117 pass / 0 fail; artifacts reproduced).

## Limits

- The lease protocol now lives in two places: the supervisor (private) and the host helper (same file and format). A
  shared execution-host export would remove the duplication; that is a P/R2 scope choice and was not needed here.
- The supervisor's own stale-lease replacement removes the file and then creates it again; that is unchanged
  behaviour.
- Removing the staged copy and the lease on a clean exit is not asserted by a test. A SIGKILLed host leaves both; the
  next run replaces them.
- No provider, network, Linux, CI or push.
