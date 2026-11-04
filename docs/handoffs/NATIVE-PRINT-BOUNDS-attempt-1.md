# Implementation-session handoff

Goal and attempt: FND-B-NATIVE-PRINT-BOUNDS-01 (the native C62 bootstrap's PRINT_CHILD did not complete within its bounds; the service is Suspended), attempt 1
Human owner / executor resource: Davide (owner); B, the sole implementation writer for this blocker (P coordinates, R2 reviews, V releases)
Native session: Claude Code desktop session `local_cf492b49-c8d1-4ab7-b811-95eaefc2b61c`
Starting worktree/commit: `sophia-ask-context-alternative`, new branch `fix/native-print-bounds-20261104` from Main `a81ae06d` (#494 merged)
Ending commit/tree and changed files: the local commit carrying this file (`git log`): `scripts/lib/common.mjs`, `scripts/lib/profile.mjs`, `scripts/lib/root-lease.mjs`, `scripts/runtime-host.mjs`, `tests/integration/profile-upgrade.test.mjs`, `tests/integration/profile-stop.test.mjs`, `tests/support/profile-stop-host.mjs`, this file.

## Outcome

- **Hosted failure: cause UNKNOWN.** The hosted root's state, the print child's physical state and the reason no `CHILD_RETURNED` line appeared after the launcher's 180 s bound are unknown. Nothing here was run against the hosted root.
- **What the source shows:**
  - The root's profile differed from C62's recorded bundle (the operator's pre-print witness: bundle `2897b8…` and lock `bafa54…`, against `c76ea236…` and `f1cda808…`). So the print took the upgrade path:
    - `.previous` is renamed to `.previous.<stamp>`;
    - the current profile is renamed to `.previous`;
    - then `dsh plugin install` runs.
  - That install had no bound of its own, and the host waited for it in a synchronous `spawnSync`.
  - dsh's CLI runs pnpm with dsh's own descriptors, in dsh's process group, with no silence bound.
- **The evidenced boundary:** a caller's bound can only signal the host, and a host blocked in that `spawnSync` dies at once. Reproduced with the real lease and reconciler and a fake dsh (B-NATIVE-PRINT-BOUNDS-01 evidence, W1):
  - the lease is left naming the dead host;
  - the new, unqualified install holds the profile's name, with both earlier profiles moved aside;
  - the install's processes go on writing into the profile after the caller has stopped.
- **Not the explanation:** in every local shape tried, the launcher's own `spawnSync` returns at its bound. A naive inner `spawnSync` timeout returns on time but leaves pnpm writing (W2). So a timeout alone bounds nothing here.
- **The correction:** the reconciler's install runs as its own process group, waited for without blocking the host. The host turns its caller's SIGTERM or SIGINT into a stop of that whole group:
  - **Group shown gone:** the existing rollback puts the current profile and `.previous` back, the lease is released by the normal exit, and the host exits 143 (130 for SIGINT).
  - **Group not shown gone after SIGKILL:** nothing is moved back, and the message names where each profile is. The lease stays naming the host, and ProjectLease's own `<lease>.takeover` marker is created with the reason, so no later print or launch takes the root over as stale. An operator removes the marker once the install is found gone. No success is reported.
  - **Signal that lands during the reconciliation's synchronous part:** still stops the host. No `profile` line, and exit 143.
- **Unchanged:**
  - no timeout is added or raised;
  - the history rules (renames only, refusals before anything moves), the lease, the print protocol and launch;
  - `installProfile` (still synchronous);
  - no-drift and refusal behaviour.

## Evidence

- `tests/integration/profile-stop.test.mjs`: 6/6. It runs the real lease and reconciliation through `tests/support/profile-stop-host.mjs` (the host's wiring) against a fake dsh whose pnpm writes into the profile. Cases:
  - cancellation confirmed gone after SIGTERM;
  - confirmed gone only after SIGKILL (the install ignores SIGTERM);
  - closure unknown: the profiles are not moved back, the lease and takeover marker are kept, and a next start is refused and changes nothing;
  - a late signal;
  - a failing install with no signal, which rolls back as before;
  - the frozen launcher's exact `spawnSync` shape.
- **Negative controls**, each with only that part removed:
  - dsh not its own group: 4 fail;
  - no event-loop turn before the late check: the late case fails;
  - no lease retention: the unknown case fails.
- The pre-fix behaviour on Main's modules is witness W1.
- With the real pinned dsh: `profile-upgrade.test.mjs` 9/9, the shipped `runtime-host` suite including FND-B115 and B-NATIVE-PROFILE-HISTORY-01 10/10.
- `pnpm lint`, root `tsc --noEmit`, `prettier --check` and `git diff --check` pass.
- Not run: Linux, CI, the hosted root, the deployed launcher. `pnpm check`: see the result handback.

## Decisions and changes

- **`reconcileProfile` is now async** and takes an optional `signal` (and `graceMs`, each stop wait, default 5 s).
  - Its only product caller is `runtime-host.mjs`, through `reconcileProfileUntilSignalled`. The tests were converted to `await`.
  - Two frozen evidence scripts call it synchronously and were left as history: `docs/evidence/SMC-M02/g5-preflight/boot-probe.mjs` and `docs/evidence/SMC-M02/inplace-cutover/rehearse.mjs`. Nothing runs them, and re-run they would fail loudly.
- **`runDshOwned` (common.mjs)** starts dsh as its own group leader. A stop sends SIGTERM to the group, then SIGKILL after the grace. The group counts as gone only when no member answers a group probe.
- **The host's stop message is written synchronously, and an unwritable stderr is ignored.** At its bound, `spawnSync` closes its pipes and waits for the exit, so the frozen launcher learns only the status.
- **Production identity:**
  - `scripts/lib/profile.mjs` and `common.mjs` change, so the reconciler's sha256 is no longer `1536800d…`;
  - the frozen launcher's `EXACT_ACCEPTED_CANONICAL_RECONCILER` and `SOURCE` checks would refuse this tree;
  - any use needs a new reviewed source, launcher and deployment decision.

## Remaining obligations

- **R2's independent review** of the exact head before any push.
- **Known limits:**
  - A descendant that leaves the group (its own `setsid`) is not seen by the group probe.
  - SIGKILL of the host itself cannot be handled: its install group then outlives it.
  - A signal before the reconciliation starts (between taking the lease and reconciling) keeps its default, as before.
  - A stopped first install leaves its partial profile, as a failed one does.
- **The hosted root:**
  - Its profile names, lease and takeover state are unknown.
  - If the host was stopped mid-upgrade, the root may hold the displaced state W1 shows; it must be read before any resume.
  - On resume, the frozen launcher would stop at its attempt claim before printing: by its source, the claim file exists once `ATTEMPT_CLAIM` passed, which the deploy log showed.

## Next bounded action

R2 independent review of the whole candidate, then P's decision on publication and on the production identity.
