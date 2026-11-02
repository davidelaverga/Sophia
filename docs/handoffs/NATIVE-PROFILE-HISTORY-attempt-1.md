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
