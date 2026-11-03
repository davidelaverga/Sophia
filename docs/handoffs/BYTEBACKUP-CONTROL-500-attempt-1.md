# Implementation-session handoff

Goal and attempt: B-BYTEBACKUP-CONTROL-500-01 (R2 disposition 02 of the merged-Main byte-backup control failure), attempt 1
Human owner / executor resource: Davide (owner); B, the sole source writer in the foundation coordination (P coordinates, R2 reviews, V releases)
Native session: Claude Code desktop session `local_cf492b49-c8d1-4ab7-b811-95eaefc2b61c`
Starting worktree/commit: `sophia-ask-context-alternative`, new branch `fix/byte-backup-control-500-20261103` from Main `4a691d43` (#493 merged), tree `20f15246`
Ending commit/tree and changed files: the local commit carrying this file (`git log`): `apps/api/src/byte-backup.test.ts`, this file.

## Outcome

- Merged Main's unit job (run 41525412269, attempt 1) failed `byte-backup.test.ts`'s fixed control as inconclusive. The caller's 100 ms deadline answered at 98 ms, before the quota worker's own refusal. The other 4099 unit tests passed.
- The fixed control now uses a 500 ms caller deadline and a lock released at a fixed 1500 ms. It is still a single attempt, and it qualifies only on the worker-exit-backed inner quota 503 strictly before the caller's deadline while the lock is held.
- Unchanged:
  - the SHARED and RESERVED refusal cases;
  - the strict untouched key, journal, copy, temporary and remote checks;
  - the released put that is admitted once, then refused, with its bytes unchanged;
  - every other test.
- This deliberately relaxes the test's synthetic setup from 100 ms to 500 ms for one worker's start and refusal. The 100 ms was a test choice, not a product contract: the renderer routes hand in 10 s (`RENDER_BODY_MS`), the backup write bound stays 10 s and the quota worker's bound stays 5 s.
- A slower-than-500 ms environment still fails as inconclusive. No runner latency or CI completion is guaranteed.

## Evidence

- Before (100 ms / 300 ms, Main's exact tree; B-NATIVE-MAIN-BYTEBACKUP-01, preserved):
  - CI: `deadline 503` at 98 ms.
  - Locally the same file passes at normal QoS (17/17).
  - It fails with CI's signature under macOS background QoS with 10 busy processes: `deadline 503` at 101 ms, with the same untouched cleanup-only after-state.
  - A diagnostic of the shipped worker's refusal time under a held lock measured, at background QoS: p50 107 ms idle and 145 ms loaded.
  - CI's own worker timeline in the failed run is unknown. The final untouched snapshot was taken after cleanup and is not qualification.
  - In the diagnostic, one aggregate late reservation and directory entry followed a deadline-first answer, with nothing uploaded. Its sample, phase and kind (copy or temporary) are unknown. It is consistent with the documented boundary: a caller timeout is not a rollback, reservations are not refunded, late private work may remain, and the remote never starts afterwards.
- After (this commit), each once, one attempt, macOS arm64, Node 24.21.0:
  - the whole file at normal QoS: 17/17;
  - the whole file under background QoS with 10 busy processes: 17/17.
- Negative witness: the candidate test with the rejected `a5219130` worker (blob `47298335`: Main's worker plus only its 1 s SQLite busy wait), in a private byte-verified copy; every other file is Main's bytes.
  - 16 pass / 1 fail: the fixed control, `inconclusive 500 ms caller / 1500 ms lock control`, `deadline 503` at 501 ms.
  - Its cleanup-only after-state was untouched: a clean final snapshot gives such a worker no credit.
  - Its SHARED and RESERVED cases passed: only the fixed control catches a waiting worker.
- `tsc --noEmit -p apps/api`, `prettier --check` and `oxlint --type-aware` on the file pass.
- Not run: `pnpm check`, the full unit suite, CI, Linux. Mac QoS and load stand in for a slow runner; this is not a Linux qualification.

## Decisions and changes

- Only the test's control constants (`CONTROL_CALLER_MS`, `CONTROL_LOCK_MS`), its deadline helper (it no longer claims the routes hand in 100 ms) and the related comments changed.
- No product, worker, quota, store, renderer, CI or dependency file changed.
- Not used, as the disposition requires: retrying until qualified, skipping, holding the lock until the worker exits (the masked 3e767e96 control), or changing job concurrency.

## Remaining obligations

- R2's independent review of the exact head and the negative witness before any push.
- New-head CI and the normal gates are owed. The unchanged-Main CI wave is closed unused and is not to be rerun.

## Next bounded action

R2 independent review, then P's publication packet.
