# Implementation-session handoff

Goal and attempt: FND-B116-LEASE-ADOPTION-OWNED-STAGING-01, attempt 1. This addresses R2's B115 HOLD:
- B115-R1: a lease unlinked during handoff;
- B115-R2: an old exit deleting the next holder's overlay.

Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `f778514e…`, R2 proof
`4b563653…`.
Start: clean `dea165fa` (tree `e9525307`) on `fix/service-reply-launch-20261020-b105`. Not pushed.

## The correction

- `apps/execution-host/src/runtime-supervisor.ts`: a public `ProjectLease`. It holds the same `<root>/supervisor.lease`
  every supervisor holds, and the supervisor now takes its own lease through it, so there is no second protocol.
  - `ProjectLease.acquire(root)` keeps every existing rule:
    - another holder in this process: `LeaseHeldError`;
    - a live process's lease: `LeaseHeldError`, now carrying `pid`;
    - a stale lease (dead pid, or this pid held by nobody here): replaced;
    - the file is created exclusively, mode 0600.
  - `SupervisorOptions.lease` is adopted as it is. The file is never removed or recreated between the caller's
    preparation and the supervisor's start, and one lease is adopted by one supervisor only.
  - `release()` is idempotent and removes the file only while it is still this pid's.
  - Default lifecycle, second-supervisor, cross-process and failed-start release behaviour are unchanged.
- `scripts/lib/root-lease.mjs`: `holdRootLease` is now `ProjectLease.acquire`, with the host's message. The duplicate
  lease file code is gone.
- `scripts/runtime-host.mjs`: passes the lease to its `RuntimeSupervisor`, so the root stays leased from before
  reconciliation through the runtime's life. The header recipe is corrected: no "in place" handoff claim.
- `scripts/lib/service-overlay.mjs`: each invocation stages its own
  `service-overlay.admitted.<pid>.<uuid>.json`, created exclusively, mode 0600. Only that invocation removes it, at
  exit after its supervisor stopped, so an old exit never removes or replaces another holder's file.
- Generated identities: none changed. `pnpm check`'s `build-artifacts` reproduced every recorded identity, and the
  execution host is not in the runtime or bundle artifacts.

## Evidence (journal `B116-logs/`)

- **Old ordering, instrumented with public API only (12):** the host's pre-reconcile lease inode `81453966`, then
  `81453967` at the supervisor's `starting` event. The file was unlinked and recreated.
- **Old source, final test bytes (10):** the source paths were stashed and the execution host rebuilt, then restored.
  - (13) the shipped positive's next-holder check: the old exit deleted the `service-overlay.admitted.json` written by
    "the next holder" (ENOENT).
  - (14) the supervisor test file cannot import `ProjectLease`.
- **Fixed, same bytes:**
  - (15) supervisor tests 7/7. The adopted lease has the same inode at `starting` and after start; another process
    gets `LeaseHeldError` with this pid; a second adoption and a second supervisor are refused; after stop the lease
    is released.
  - (16) focused service tests 12/12. The next-holder files survive this host's exit, its own staged file is gone,
    the lease is released, and the restart after rewrite still serves the role.
- Whole service file, own fresh PG17 port 55501 (22): 37/37.
- `pnpm check` (30): exit 0 (unit 3612 pass; integration 118 pass; artifacts reproduced).

## Limits

- The schedules are proven at the adoption boundary (inode identity) and the exit boundary (next-holder files). No
  two real hosts were raced.
- A SIGKILLed host leaves its uniquely named staged file; nothing sweeps it (it is never read by another invocation).
- The supervisor's stale-lease replacement (unlink, then exclusive create) is unchanged for non-adopted starts.
- No provider, network, Linux, CI or push.
