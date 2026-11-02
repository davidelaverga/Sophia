# Implementation-session handoff

Goal and attempt: B-NATIVE-PROFILE-HISTORY-01, attempt 1
Human owner / executor resource: Davide (owner); B, the sole source writer in the foundation coordination (P coordinates, R2 reviews, V releases)
Native session: Claude Code desktop session `local_cf492b49-c8d1-4ab7-b811-95eaefc2b61c`
Starting worktree/commit: `sophia-ask-context-alternative`, new branch `fix/native-profile-history-20261102` from Main `01f89a6e` (#492 merged)
Ending commit/tree and changed files: the local commit carrying this file (`git log`): `scripts/lib/profile.mjs`, `tests/integration/profile-upgrade.test.mjs`, `tests/integration/conversation-service.test.mjs`, this file.

## Outcome

- The runtime host calls `reconcileProfile` under the root's lease for both `--print-executor-digest` and every launch. On drift it deleted an existing `dsh-home/profiles/.<profile>.previous` before moving the current profile there, so an upgrade erased the history an earlier upgrade had kept. Production holds both a current and a distinct previous profile.
- Now no reconciliation deletes a kept profile:
  - an existing `.previous` is renamed, whole, to `.<profile>.previous.<stamp>` (UTC to the millisecond plus 8 random hex);
  - the replaced profile becomes `.previous` as before, and the committed profile is installed and verified as before;
  - if the install or its check fails, only the new, unqualified install is removed, and both earlier profiles go back where they were.
- It is refused before anything moves when:
  - the profile or the existing `.previous` is not a directory of its own (a link, a file);
  - the new name is already used, even by an empty directory, which a rename would otherwise replace;
  - the stamp is not a plain name.
- No-drift and first-install behaviour is unchanged. The lease, its order and the host are unchanged.
- Kept profiles are never removed by the code; retention is the operator's.

## Evidence

- On Main's reconciler, the new tests fail:
  - `profile-upgrade.test.mjs`: 4 of 5 new tests (the earlier `.previous` is deleted; the failed install loses it; a linked `.previous` is replaced instead of refused);
  - the shipped-host test: print leaves no earlier `.previous`.
- After the repair:
  - `profile-upgrade.test.mjs`: 9/9;
  - the shipped-host test (print upgrade, launch upgrade, then a recovery start) and the existing FND-B115 lease tests: 3/3.
- `pnpm check`: see the result handback.
- The executor closure does not read the `profiles/` directory listing, so kept profiles change no digest. No artifact identity changes: the bundle and runtime are untouched.

## Decisions and changes

- The repair is in the reconciler, the one place every print, start, restart and recovery passes. It is not in a shell precheck or the host.
- `stamp` is an optional argument so tests can name the kept profile and make a collision; the host uses the default.
- A launch stopped during its startup can leave its own lease naming its dead pid (the signal handlers are installed after the supervisor starts). That is unchanged; the test shows the next start takes the root and keeps the history.

## Remaining obligations

- R2's independent review of the exact head before any push.
- Disk use grows by one profile per upgrade; removing old kept profiles is a manual, operator-selected step.
- No Linux host, production root or deployed launcher was run.

## Next bounded action

R2 independent review of the whole candidate, then P's publication packet.

## R1 test repair (B-NATIVE-PROFILE-HISTORY-R1-TEST-REPAIR-01)

- R2 found that the new shipped-host test signalled the launch at its profile line, awaited its exit without a bound, then printed again and removed the root without showing the host's processes gone.
- Observed before the repair:
  - the host, signalled at its profile line (before its shutdown handlers exist), exits and leaves its dsh child running;
  - an earlier run's removed fixture was recreated by such a child (`root/home/tmp/...native-cache`).
- The test now starts each host (print and launch) through `tests/support/owned-process.mjs`:
  - its own process group;
  - waits raced against a timer whose loss is asserted;
  - `settle` sends SIGTERM to the group, then SIGKILL, and verifies the process, the group and every descendant seen are gone within a bound.
- The recovery print and the fixture's removal come only after that. A run not shown settled fails the test and keeps the fixture; a descendant that left the group is checked, never signalled.
- `scripts/lib/profile.mjs`, the host, the lease, records and artifacts are unchanged.
- Qualified with the real shipped host:
  - the success path;
  - an early failure, an assertion after the dsh child started, a wait timeout and a host not ending within its bound: all settled and the fixture removed;
  - a spawn error;
  - an escaped descendant: the run fails and keeps the fixture.
- On Main's reconciler the test still fails on the kept-history assertion, and cleans up.

## Finite enumeration (B-NATIVE-PROFILE-HISTORY-FINITE-ENUM-01)

- R2 found that the helper's `ps` ran synchronously with no timeout, so a slow or stuck `ps` held up a wait's deadline and settle's signals.
- Observed on `0b264b22`'s helper with `ps` stand-ins:
  - a 100 ms wait took about 1.5 s;
  - a hanging `ps` delayed settle (and its first signal) by 30 s;
  - a failing or unreadable `ps` was read as no descendants, and the fixture was removed.
- `ps` now runs asynchronously, within the caller's remaining budget (at most 2 s a look). A look that times out (the `ps` is then killed), fails, or prints a table that cannot be read leaves the descendants unknown, never empty.
- `settle` still signals the owned group and waits for it within its bound, then throws when the descendants are unknown, so the test keeps its fixture.
- Qualified with stand-ins and the real shipped host:
  - waits keep their bound;
  - settle ends in about 2 s with a hanging `ps` and still settles the host and its dsh child;
  - each failed enumeration keeps the fixture;
  - the real `ps` path, the shipped-host test, the R1 cleanup scenarios and the old-code failure are unchanged.

## Losing deadline (B-493-LOSING-TIMER-REPAIR-01)

- The automatic review of `7cf560ff` (#493, one P2) found that `ended(ms)` raced the child's end against `sleep(ms)` and never cleared the losing timer, so a worker whose child had ended and been settled stayed alive until the unused deadline.
- Reproduced on `7cf560ff` by `tests/unit/owned-process.test.mjs`, which watches a worker process from outside: two workers whose child ended at once (and one whose child could not start) were still running 10 s after reporting their child settled, against a 60 s deadline.
- `ended` now clears its timer once the race is decided. Its refusal at the deadline, the spawn-error outcome and `settle` are unchanged.
- After the fix:
  - the three cases pass in about 1 s (each worker exits as soon as it reports);
  - a child that does not end is still refused at its 500 ms deadline and settled;
  - the shipped-host block runs in 23 s instead of about 134 s;
  - the R1 cleanup (8/8) and finite-enumeration (7/7) qualifications pass again.
