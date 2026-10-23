# Implementation-session handoff

Goal and attempt: FND-B117-STALE-LEASE-EXCLUSIVE-TAKEOVER-01, attempt 1. This addresses automatic CODE finding
4326835670 on `bf582` (concurrent stale read, remove, new-holder unlink), plus P's mid-packet addition: the interval
between creating the lease and recording its pid.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `76e97779…`.
Start: clean `bf582364` (tree `2635241b`). Not pushed.

## The correction (apps/execution-host/src/runtime-supervisor.ts, ProjectLease.acquire)

- **Creation with the pid already in it:** the pid is written to a private `supervisor.lease.<pid>.<uuid>.new` file,
  which is then `link()`ed to `supervisor.lease`. link never replaces an existing path, so the lease appears with its
  pid already written; it is never visible empty or partial. The draft is removed either way.
- **Stale takeover under a marker:** a lease that is present but stale (its pid dead or unparseable, or this
  process's but held by nobody here) is removed only by the process holding `supervisor.lease.takeover`, a directory
  one process at a time can create. That process re-reads the lease, removes it only if it is still present and
  stale, and releases the marker.
  - Why that is safe: a path is replaced only by being removed first, and only a marker holder removes another
    process's lease (`release()` removes only this process's). So the file it re-read is the file it removes.
  - Creation is still the exclusive link; whoever wins it owns the lease, and the loser gets `LeaseHeldError`.
- **Unchanged:** a live foreign holder (`LeaseHeldError` with `pid`), a holder in the same process, single
  adoption, release and the default lifecycle. The lease format (pid and a newline) is unchanged, so leases written
  by earlier code are still read.

## Disclosed boundary: a process dying while it holds the marker

The marker exists only between `mkdir` and `rm` around one re-read and one unlink. If a process dies inside that
step, the marker stays. From then on:
- every stale takeover of that home is refused with `LeaseHeldError` naming the marker path;
- a home with no lease file is still acquired normally;
- nothing removes the marker automatically. There is no recursive stale-marker protocol; an operator has to decide.

This is a narrower outage than before (stale recovery of that one home, after a crash in a microsecond step), but it
is a real limit, not a guarantee.

## Evidence (journal `B117-logs/`)

Old FAIL is shown on bf58 by stashing only `runtime-supervisor.ts` and rebuilding; the source was restored after.

- **(11) first test bytes:** contender B paused right after its stale read, A took the stale lease over, B resumed and
  also owned it (`owned: true`), removing A's lease.
- **(21) marker-only intermediate (my first fix):** contender C paused right after creating the lease and before
  writing its pid; D read the empty lease as stale and took it (`owned: true`). This is P's interleaving, executed.
  The run had a phase-2 harness bug, later fixed, but it failed before reaching that point.
- **(22) first fixed run:** phase 1 and D's refusal passed, but a harness bug failed it (phase 2 reused phase 1's done
  file, so C released early). Fixed with a separate done file (final test bytes, 30).
- **(31) fixed, final bytes:** `supervisor.test.mjs` 8/8.
  - B gets `LeaseHeldError` naming A, and A's lease keeps its content and inode.
  - D gets `LeaseHeldError` naming C while C is held right after creating the lease, then C owns it.
  - Both release their own lease, and stale recovery works afterwards.
  - The existing adoption, second-supervisor, crash-restart, exhausted-budget and failed-start tests pass.
- **(32) old bf58, final bytes:** B owned too (FAIL).
- **(33) host lease refusal (FND-B115):** passes. **(40) `pnpm check`:** exit 0, all artifact identities reproduced.

## Limits

- The interleavings are forced at the two real boundaries (after the stale read, after the create) through a
  `node:fs` seam inside the contender's own process. They are not unconstrained races, and there is no guarantee
  against a hostile filesystem.
- The marker boundary above.
- Code from before B117 that writes the lease with an exclusive create and then the pid still has its own empty-lease
  interval, if it runs concurrently against the same root.
- No provider, network, Linux, CI or push.
