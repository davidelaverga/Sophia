# Implementation-session handoff: PERSONAL-PENDING-PROTOCOL-FOLLOWUP-001

- Goal and attempt: PR #533 discussion_r4636932235, attempt 1; bounded C5 transition from open legacy personal reads.
- Human owner / executor: Davide / delegated Codex author; native session unknown, task `/root/personal_recorded_status_author`.
- Parent: `e4d12e9b15e33d90247a12ea99b470f9db9137c7`, detached isolated worktree.
- Ending identity: staged candidate tree returned separately to the coordinator; author created no commit. The final two guards were staged over the coordinator’s unpublished local candidate `a72a13540ded694df05be5fcaa2e718063d44c43` before its amendment.

## Outcome

A legacy pending-turn poll or earlier-turn GET refused with exact C5 (503 projection_unavailable, retry never) now pins the account to A55 and invalidates only its current personal-space query. The observed pin hides cached legacy words and typing while A55 is pending or fails. Existing retry then reads A55. The existing controlled pin prevents repeated cancellation of an A55 read already on its way. Both legacy GET consumers also check that pin synchronously at entry, so a callback preceding the observer rerender cannot start another legacy request. Aborted callers cannot pin or refresh; ordinary errors retain their existing behavior. The usePersonalSpace comment now correctly describes ordinary poll backoff.

The adjacent earlier GET was confirmed by the coordinator as the same read-protocol defect before editing that consumer. No export action, backend, schema, flags, copy or styling changed.

## Evidence

All logs and browser artifacts are retained outside source in the local follow-up directory `PERSONAL-PENDING-PROTOCOL-FOLLOWUP-001`, alongside this worktree. Exact absolute paths were sent in the handback.

- Frozen dependency install and exact toolchain check pass: Node 24.21.0, pnpm 11.7.0 (`install.log`, `toolchain.log`).
- Original production bytes with corrected app regressions: both pending poll and earlier GET fail because no A55 read starts (`red-corrected-browser.log`, `red-corrected-browser-artifacts/`). No skipped/cancelled tests. First red attempt retained (`red-browser.log`): waiting fails at that same boundary; earlier had a wrong fixture menu selector, corrected to the existing day-menu entry.
- First repaired targeted run: six transition regressions pass (`green-browser.log`), covering both consumers switching, hiding legacy while A55 is held/fails, stopping legacy polling, retrying only A55, near-C5 safe_read remaining ordinary, and refusal released after lock not restoring a pin.
- Final browser run: 33 pass, zero failures/skips/cancellations (`full-browser.log`, `full-browser-artifacts/`): `pnpm exec playwright test e2e/app-personal-controlled.spec.ts e2e/personal-recorded.spec.ts --workers=2`. Includes concurrent legacy refusals keeping the first held A55 request, existing account/lock/reader boundaries, and existing desktop/phone recorded presentation checks. Every new request ledger asserts no API writes.
- Focused unit run: 237 pass, zero failures/skips/cancellations (`focused-unit.log`): `node --test apps/studio/src/api/personal.test.ts apps/studio/src/features/personal/*.test.ts`.
- Final two-guard amendment on the coordinator’s unpublished local candidate: seven affected C5 transition scenarios pass, touched-file type-aware lint and Studio typecheck pass (`guards-browser.log`, `guards-checks.log`).
- Studio typecheck passes (`typecheck.log`); touched-file type-aware lint passes (`lint-final.log`); final touched-file formatting and staged whitespace checks pass (`final-source-checks.log`). Initial lint attempt reported fixture routing complexity 13; split the two added legacy fixture routes into their own helper, without suppression (`lint.log`).
- An initial command used the Studio working directory with repository-relative edit paths and made no source edit; its unsuccessful format attempt is retained (`format-wrong-cwd-attempt.log`).
- The late-success regression reproduced an extra A55 request on unpublished commit `80f4bb52` once the fixture returned a valid legacy page (`late-success-red-corrected.log`). The two post-response checks now discard successful legacy responses after the switch. All eight focused protocol transition scenarios passed (`late-success-green.log`).

## Source and changed paths

Sources: existing A54/A55/C5 protocol recognition and pin/cache helpers in api/personal.ts; usePersonalSpace/useReadBack and their cancellation boundaries; existing synthetic signed-in app suite; repository AGENTS.md, CONTRIBUTING.md Studio rules, pack entry/decisions/map/goal index and architecture 13. No upstream source added.

Changed paths: apps/studio/src/features/personal/usePersonal.ts; apps/studio/e2e/app-personal-controlled.spec.ts; this handoff.

## Remaining obligations and next action

Local synthetic browser evidence only: no real account, PostgreSQL, native runtime or production qualification. Full repository gate not run for this bounded hook repair. Fixture logs include AbortError for cancelled reads while all final assertions pass. Fixture ports 5198/5199 had no existing listeners before the owned runs and were released afterward. No credentials, commit, push, GitHub mutation, activation, merge or production effect. Independent exact-tree review remains the coordinator's next bounded action.
