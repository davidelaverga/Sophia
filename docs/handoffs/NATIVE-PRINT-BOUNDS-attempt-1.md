# Implementation-session handoff

Goal and attempt: FND-B-NATIVE-PRINT-BOUNDS-01 (the native C62 bootstrap's PRINT_CHILD did not complete within its bounds; the service is Suspended), attempt 1, with review-repair exchange 1 (R2-NATIVE-PRINT-F908-PREPUSH-01)
Human owner / executor resource: Davide (owner); B, the sole implementation writer for this blocker (P coordinates, R2 reviews, V releases)
Native session: Claude Code desktop session `local_cf492b49-c8d1-4ab7-b811-95eaefc2b61c`
Starting worktree/commit: `sophia-ask-context-alternative`, new branch `fix/native-print-bounds-20261104` from Main `a81ae06d` (#494 merged); first candidate `f90836f6` (rejected, kept), repaired by the next commit
Ending commit/tree and changed files: the local commit carrying this file (`git log`): `scripts/lib/common.mjs`, `scripts/lib/profile.mjs`, `scripts/lib/root-lease.mjs`, `scripts/runtime-host.mjs`, `tests/integration/profile-upgrade.test.mjs`, `tests/integration/profile-stop.test.mjs`, `tests/integration/conversation-service.test.mjs`, `tests/support/profile-stop-host.mjs`, this file.

## Outcome

- **Hosted failure: cause and stage UNKNOWN.** Unknown:
  - which stage the hosted print child reached;
  - its physical state;
  - whether a pin was written before Suspend;
  - why no `CHILD_RETURNED` line appeared after the launcher's 180 s bound.

  Nothing here was run against the hosted root.
- **What the source shows:** the operator's pre-print witness found the root's profile different from C62's recorded bundle (bundle `2897b8…` and lock `bafa54…`, against `c76ea236…` and `f1cda808…`). So IF the print reached reconciliation, it took the upgrade path:
  - `.previous` is renamed to `.previous.<stamp>`;
  - the current profile is renamed to `.previous`;
  - then `dsh plugin install` runs.

  In C62 that install had no bound of its own, and the host waited for it in a synchronous `spawnSync`. dsh's CLI runs pnpm with dsh's own descriptors, in dsh's process group, with no silence bound.
- **The evidenced boundary:** a caller's bound can only signal the host, and a host blocked in that `spawnSync` dies at once. Reproduced with the real lease and reconciler and a fake dsh (W1):
  - the lease is left naming the dead host;
  - the unqualified install holds the profile's name, with both earlier profiles moved aside;
  - the install's processes go on writing after the caller has stopped.

  In every local shape tried, the launcher's own `spawnSync` returns at its bound. A naive inner `spawnSync` timeout returns on time but leaves pnpm writing (W2). So a timeout alone bounds nothing here.
- **The correction:** every way the install ends must establish that its process group is gone before anything is verified, moved back or released. When that is not shown, the root stays excluded.
  - **Owned closure (`runDshOwned`).** dsh runs as its own process group, waited for without blocking the host.
    - Natural exit, a stop by `signal`, and output past its bound all go through one closure. Members still running after dsh exited by itself are stopped (SIGTERM, then SIGKILL), and such an install is not qualified, whatever dsh's code.
    - The group counts as gone only when a probe answers ESRCH. Any other probe or kill error leaves the closure unknown.
    - Output is bounded (256 MiB combined, the bound `run` gives `spawnSync`). Overflow is a stop, never a success, and a diagnostic carries only a tail.
  - **Exclusion made before the first change.**
    - The host creates ProjectLease's own takeover marker, `<lease>.takeover`, exclusively and never through a link, before the reconciler moves or installs anything. A marker that cannot be made refuses with nothing changed.
    - It is removed only when the outcome is settled with the group gone, and only while it is still the empty directory this process made.
    - When the closure is unknown, nothing is verified or moved back. When the release or the putting back fails, the hold is marked kept before anything else can fail. In both cases the lease is not released, the host exits nonzero, and nothing is reported as reconciled. The reason is added to the marker only as `reason`, written exclusively and only into this process's own marker.
  - **A root with the marker is refused,** print and launch, before anything is reconciled: with a stale lease, the takeover is refused; with no lease file, the host refuses on the marker itself.
  - **Signals.** The host turns its caller's SIGTERM or SIGINT into a stop, exiting 143 or 130 once the outcome is settled. A signal that lands during the reconciliation's synchronous part still stops it.
- **Unchanged:**
  - no timeout is added or raised;
  - the history rules (renames only, refusals before anything moves);
  - the lease's own rules, the print protocol and launch;
  - `installProfile` (still synchronous) and the no-drift path.

## Evidence

- **`tests/integration/profile-stop.test.mjs`: 12/12.** It drives the host's root preparation (`holdHostRoot` and `reconcileHostProfile`, the calls `runtime-host.mjs` makes) against a fake dsh. Cases:
  - cancellation confirmed gone after SIGTERM, and only after SIGKILL;
  - the frozen launcher's exact `spawnSync` shape;
  - dsh exiting 0 and 7 by itself with a writer of its group still running, output closed: stopped first, then the rollback;
  - closure unknown, after a stop and after a natural exit: nothing moved back, the lease and marker kept, and a next start refused and changing nothing, also once the lease file is gone;
  - output past its bound;
  - a marker that cannot be released after the rollback;
  - markers of every kind (directory, file, link, dangling link), with and without a stale lease;
  - a late signal;
  - an ordinary failing install.
- **The shipped entry with the recorded runtime** (`conversation-service.test.mjs`, B-NATIVE-PRINT-BOUNDS-01):
  - `runtime-host.mjs --print-executor-digest` stopped by SIGTERM during a real upgrade: exit 143, both profiles byte-identical to before, the lease and exclusion released, nothing left running;
  - then the excluded root refused, print and launch, with and without a lease file, changing nothing.
- **Negative controls on the repair,** each removing one part of the production code in `scripts/lib`:
  - no survivor check after a natural exit: 3 fail;
  - no exclusion hold: 10 fail;
  - the lease released when excluded: 3 fail;
  - no output bound: the noisy-install case did not finish and hit the 30 s test timeout, a negative non-success rather than an assertion count;
  - no marker refusal: 4 fail.

  The candidate was restored byte-identical after each.
- **The R1 witness on f908's exact files:** the host exited 1 with its rollback done, lease released and no exclusion, while the writer lived on and wrote 12 times in the next 600 ms into the restored profile. On the repair: the writer was gone, with 0 writes.
- **Also:** with the real pinned dsh, `profile-upgrade.test.mjs` 9/9 and the shipped entry's suite 11/11. `pnpm lint`, root `tsc --noEmit`, `prettier --check` and `git diff --check` pass.
- **Not run:** Linux, CI, the hosted root, the deployed launcher. `pnpm check` on this head: see the result handback.

## Decisions and changes

- **`reconcileProfile` is async.** It takes `signal`, `exclusion` (`hold`/`release`), and the test-only `graceMs` and `outputBytes`.
  - Its only product caller is `runtime-host.mjs`, through `reconcileHostProfile`. The tests were converted to `await`.
  - Two frozen evidence scripts call it synchronously and are left as history: `docs/evidence/SMC-M02/g5-preflight/boot-probe.mjs` and `docs/evidence/SMC-M02/inplace-cutover/rehearse.mjs`. Nothing runs them, and re-run they would fail loudly.
- **The host's root preparation lives in `lib/root-lease.mjs`** (`holdHostRoot`, `reconcileHostProfile`), so the test entry runs the same code. Only the argument parsing and the recorded runtime's identity check are outside it.
- **The exclusion reuses ProjectLease's documented takeover marker** rather than a new lease mechanism.
- **The stop message is written synchronously, and an unwritable stderr is ignored.** At its bound, `spawnSync` closes its pipes and waits for the exit, so the frozen launcher learns only the status.
- **Production identity:**
  - `profile.mjs`, `common.mjs`, `root-lease.mjs` and `runtime-host.mjs` change, so the reconciler's sha256 is no longer `1536800d…`, and C62's input equality no longer holds;
  - the frozen launcher's `SOURCE` and `EXACT_ACCEPTED_CANONICAL_RECONCILER` checks would refuse this tree;
  - any use needs a new reviewed source, launcher and deployment decision.

## Remaining obligations

- **R2's independent review** of the exact head before any push.
- **Known limits:**
  - A descendant that leaves the group (its own `setsid`) is not seen by the group probe.
  - SIGKILL of the host itself cannot be handled. Its install group outlives it, but the exclusion marker stays, so the root is refused until an operator looks.
  - A signal before the reconciliation starts (between taking the lease and reconciling) keeps its default, as before; nothing has changed by then.
  - A marker creation that fails other than by an existing entry is handled by the same refusal, but is not fault-injected here.
  - A failed first install leaves its partial profile, as before.
- **The hosted root** (stage, profile names, lease, takeover and pin state unknown):
  - IF its print was stopped mid-upgrade, the root may hold W1's displaced state; it must be read before any resume.
  - The frozen launcher reuses a valid cached pin before its attempt claim. Its claim refuses a future print ONLY when no qualified pin exists, and whether a pin was written before Suspend is unknown.
  - This document gives no authority to remove a marker or pin, to clean up, or to resume.

## Next bounded action

R2 independent review of the cumulative candidate, then P's decision on publication and on the production identity.
