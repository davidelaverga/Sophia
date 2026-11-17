# Implementation-session handoff

Goal and attempt: SAVE-REPLY-LOST (items 1 and 2 of `evaluacion-2026-11-16/textos-lote-18.md`: a goal's owner and date,
and a member's role, saved without a reply), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-4`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-4`, branch `seams/lost-save-reply` from `origin/main`
`9495c87fc` (through #513)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no contract.
Runtime unit: Luis's Windows host (Playwright through the session's `pw-gentle.ps1` guard); CI as the run on record.
Existing authority: Luis 2026-11-16 approved the lines of lote 18 («Saved. The reply was slow, so we checked.», «Not
saved. Try again.», «The role wasn’t changed. Try again.»); local only, nothing pushed.
Ending commit/tree: `f15d087e6`, the last commit that changes code; files changed against `9495c87fc`:
`apps/studio/src/api/reply-lost.ts` and its test (new), `apps/studio/src/features/work/GoalTargets.tsx`, `apps/studio/src/features/access/InProject.tsx`,
`apps/studio/src/app/theme.css` (one selector), `apps/studio/fixtures/fixture-api.ts`, `apps/studio/fixtures/room.tsx`,
`apps/studio/e2e/goal-owner-date.spec.ts`, `apps/studio/e2e/member-roles.spec.ts`, `docs/plans/save-reply-lost.md`,
and this record.

## Outcome

- **One rule for a lost reply** (`replyLost`): no `ApiError` (network failure, the write's timeout), status 0, a 5xx, or
  an unreadable reply. Any 4xx is the API's answer and keeps today's words.
- **Goals:** after a lost reply the targets are read again. The owner and date as sent: status «Saved. The reply was
  slow, so we checked.»; otherwise alert «Not saved. Try again.», the typed date kept. The form moves to the revision
  read, so Save again is never refused as stale («Someone changed it meanwhile») for the person's own save.
- **Roles:** after a lost reply the members are read again. The role as sent: status «Saved. The reply was slow, so we
  checked.» on the row; otherwise alert «The role wasn’t changed. Try again.». The select shows the role that stands.
- **Lever:** `window.fixture.loseNextSaveReply(landed)` loses the next goal-target or role PUT's reply, after it is
  recorded or before it reaches the API.

## Commits

- `74173de1e` test: a goal's owner and date saved without a reply says what landed (failing)
- `04176f109` A goal's owner and date saved without a reply says what landed
- `9fbf5631e` test: a member's role changed without a reply says whether it changed (failing)
- `f15d087e6` A member's role changed without a reply says whether it changed

## Evidence

- **Written first and failing:**
  - unit `reply-lost.test.ts` at `74173de1e`: `ERR_MODULE_NOT_FOUND` for `reply-lost.ts`.
  - goals at `74173de1e` (`pw-logs/lostsave-goal-red.txt`): landed, `Expected: "Saved. The reply was slow, so we
    checked."`, element not found; not landed, `Expected: "Not saved. Try again."`, `Received: "Couldn’t save the owner
    and date. Try again."`.
  - roles at `9fbf5631e` (`pw-logs/lostsave-role-red-goal-green.txt`): landed, the saved status not found; not landed,
    `Expected: "The role wasn’t changed. Try again."`, `Received: "Failed to fetch"`. The same run: `goal-owner-date`
    9/9 green with `04176f109`.
- **Green at `f15d087e6`:** not yet run. The guard stopped the first run when free RAM fell to 5.9 GB
  (`pw-logs/lostsave-green.txt`, exit 91), and free RAM stayed between 2.7 and 7.9 GB for the next hour (pw-gentle
  needs 8). Owed: `goal-owner-date`, `member-roles`, `remove-member`, `goal-overdue` through the guard.
- **Checks:** unit `reply-lost` and `client` 55/55; `tsc` exit 0; whole-repo `oxlint --type-aware` exit 0; Prettier
  clean on every touched file.

## Measured against the source

- Both writes (`setGoalTarget`, `changeMemberRole`) let a network failure or timeout through as the browser's raw
  `TypeError`/`AbortError`, never `outcome_unknown`; so the role row showed «Failed to fetch» (the source's «raw
  error»). The Knowledge pattern lives in `features/artifacts/SummaryEditor.tsx`, not under knowledge; its idea (read
  again, say what landed) is reused without its unheard-save bookkeeping, since these forms re-key on the revision.

## Limits

- A read after a lost reply that fails too keeps today's words («Couldn’t save the owner and date. Try again.»,
  «Couldn’t change the role.»).
- A teammate's change between the lost save and the read looks like «Not saved», or like «Saved» if it matches.

## Not done

- The green e2e run at `f15d087e6` (above).
- Not pushed; no PR.
