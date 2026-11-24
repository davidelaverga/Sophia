# Implementation-session handoff: PERSONAL-EXPORT-PROTOCOL-FOLLOWUP-001

- Goal and attempt: PR #533 discussion_r4637212358, attempt 1; bounded same-gesture export recovery after C5.
- Human owner / executor: Davide / delegated Codex author; native session unknown, task `/root/personal_recorded_status_author`.
- Parent: `ae3a7598fa334a54b5b3af62b9a74f207beb3327`, verified detached isolated worktree.
- Ending identity: staged tree returned separately to coordinator; no author commit created.

## Outcome

One explicit Copy can finish after its initial legacy export is refused with exact C5 (503 projection_unavailable, retry never), even after a valid partial page. The failed aggregate is discarded; the existing helper pins the exact identity cache key and refreshes that account’s space, then the same still-current copy loader starts a new controlled export at cursor zero. The clipboard receives only the completed controlled text through its original single promise/write. Further copies read the synchronous controlled pin, even before rendered state catches up.

The copy captures the signed-in account subject and original epoch. Signal, mounted sheet, stored lock, active erasure, current account, epoch and exact cached-space epoch guard recovery. Controlled failures never fall back to legacy; ordinary/near-C5 failures remain failures. The existing signal cleanup also runs on account subject changes, without treating token refresh for the same account as a new account.

Closing/locking the sheet calls off its wait even while A55 remains held. Each copy attempt owns its export controller, aborted once that clipboard attempt settles or fails; an early clipboard denial cannot later upgrade protocols from a pending export. This controller is independent of the existing stillOpen predicate and global unanswered-write tracking, so valid unconfirmed/late clipboard writes retain their existing behavior.

The existing ClipboardItem Blob promise is now observed for rejection: a clipboard that rejects before consuming it no longer leaves the aborted payload rejection unhandled. The identical payload promise is passed to the same ClipboardItem/write; copyFetched still reports the original load error.

## Evidence

Logs and artifacts are retained outside source in the sibling local `PERSONAL-EXPORT-PROTOCOL-FOLLOWUP-001` directory. Exact absolute paths were supplied in the handback.

- `install.log`, `toolchain.log`: frozen install and Node 24.21.0/pnpm 11.7.0 check pass.
- `red.log`, `red-artifacts/`: the new one-Copy app regression fails on exact original production bytes; no controlled completed export reaches the clipboard after legacy C5.
- `green.log`: initial four app cases pass. `green-final.log`: six cases pass; the early-denial case exposes the previously unobserved Blob promise rejection, fixed afterward. Initial `lint.log` reported an unnecessary local no-op function; replaced with an optional listener reference without suppression.
- `full.log`, `full-artifacts/`: 40 browser checks pass, zero failures/skips/cancellations: `pnpm exec playwright test e2e/app-personal-controlled.spec.ts e2e/personal-recorded.spec.ts --workers=2`. Includes actual synthetic signed-in App, real browser clipboard, discard of partial legacy pages, one completed write per gesture, no repeated legacy export after pin, near-C5, held A55 with lock/close, early clipboard denial, epoch change, and existing polling/read-back/lock/sign-out and desktop/phone presentation checks. Synthetic request ledgers assert no API writes.
- `unit.log`: `node --test apps/studio/src/api/personal.test.ts apps/studio/src/features/personal/*.test.ts`: 237 pass, zero failures/skips/cancellations, including existing clipboard late-write, unanswered-write and erasure behavior.
- Final account-cleanup dependency amendment: `final.log`, `final-artifacts/` rerun the six affected export cases on final bytes. `final-checks.log` records final touched-file formatting, type-aware lint and Studio typecheck. `staged-check.log` records staged whitespace verification.
- Fixture ports 5198/5199 had no listener before owned runs and are released at completion. Existing fixture logs can report AbortError on intentionally cancelled reads; final runs have no copy-attempt unhandled rejection.

## Scope and sources

Changed paths: apps/studio/src/features/personal/DataSheet.tsx; Places.tsx; usePersonal.ts; copy.ts; apps/studio/e2e/app-personal-controlled.spec.ts; this handoff.

Source evidence: existing C5/A54/A55 protocol helpers and epoch-bound export readers in api/personal.ts, exact-account readControlledAfterRefusal, DataSheet copyFetched lifecycle, accountOf/stillSignedIn, Places’ sole DataSheet caller, existing signed-in clipboard app fixture and copy unit tests. Repository AGENTS.md, CONTRIBUTING.md, pack entry/decisions/map/goal index and architecture 13 apply. No new upstream source or schema generated.

## Remaining obligations

Local synthetic verification only; no real account, PostgreSQL, native runtime or production qualification. Full repository gate not run for this bounded Studio repair. No credential access, account change, activation, API write, GitHub mutation, commit, push, merge or production action. Coordinator’s next bounded action is independent review of the exact staged tree before any publication decision.
