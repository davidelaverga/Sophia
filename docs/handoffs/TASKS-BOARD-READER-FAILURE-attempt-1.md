# Implementation-session handoff

Goal and attempt: TASKS-BOARD-READER-FAILURE (Codex P2 on #472, `apps/studio/src/features/work/planning/ServedWork.tsx:71`,
the last entry of `evaluacion-2026-10-16/seguimientos-p2.md`; Luis 2026-10-20: «Procede con el próximo lote y arregla
tú los de Davide», and «Lo que no se mide, no se puede mejorar»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-5`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-5`, branch `tasks/board-reader-failure` from `origin/main`
(`9a6b03a73`; not pushed)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-20 (above); local only, nothing pushed.
Ending commit/tree: `5f1de87f0` (tree `16fcd4c706b7`), the last commit that changes code; the next one adds only this
record. Files changed against `9a6b03a73`: `e2e/board-robust.spec.ts`, `fixtures/fixture-api.ts`, `fixtures/room.tsx`,
`src/api/work.ts`, `src/features/work/planning/ServedWork.tsx`, `src/features/work/planning/fixture-boundary.test.ts`,
`docs/plans/silent-views.md` (new section «A board the reader refuses is a failed read too»), and this record.

## Outcome

- **A board Tasks can't accept is said, not shown as goals with no plan.** When `/plans` answered 200 with a board the
  board's reader refuses, or another project's board, Tasks showed each goal alone with no line and no Try again. It now
  says «The tasks can’t be read right now.» with Try again, as for a lost reply; Try again, answered rightly, brings the
  boards back.
- **A board already on screen stays.** Before, a refused reply after a good read replaced the query's data and the
  boards vanished, unsaid. Now the refusal is a failed fetch, and TanStack keeps the board read before.
- **The sibling reads don't have the gap.** The members (`parseProjectMembers`) and the source-review pilot
  (`parseSourceReviewAvailability`) parse inside the call, so a reply they refuse is `callApi`'s `contract_violation`
  and their queries fail as for a lost reply; neither reply names a project. Their failed state stays as judged in
  `silent-views.md` (decorative); neither says «none» falsely. No change.

## Evidence

- Code read for each claim of the source: confirmed. `readBoard` passed the reply through (`(value) => value`) and
  `useBoard` ran `readBoardView` and the project check in a `useMemo` after a successful query, so `failed`
  (`data === undefined && isError`) stayed false. One thing more than the source said: a refused reply after a good read
  also wiped the boards on screen (the third check below).
- Note committed first (`46d5a5d3c`).
- **Written first and failing** (`dafb4f91c`; log `pw-logs/board-reader-red.txt`): 3 failed, 2 passed (the existing two).
  - «board · a board its reader refuses says so with Try again…» and «board · another project’s board says so…» fail on
    `getByRole('region', { name: 'Tasks' }).getByRole('alert').filter({ hasText: 'The tasks can’t be read right now.' })`
    «element(s) not found» after 20 s; the page snapshot shows region «Tasks» with the goals' count «3» and the goals
    alone.
  - «board · a board its reader refuses after the board was read keeps the plans…» fails on
    `getByRole('region', { name: 'Tasks' }).locator('.board').first()` «element(s) not found» right after the first
    refused reply: the boards were gone, the goals alone.
  - New lever in the same commit: `boardRead=malformed|foreign` / `window.fixture.answerBoard(kind | null)`, each reply
    recorded `board-answered:<kind>`. `malformed` is the right board with `coverage: 'most of it'`; `foreign` is another
    project's board, whole and well formed with no goals, so only the project check refuses it.
- Fix `5f1de87f0`. Green through the guard: `board-robust`, `search-goals`, `task-links`, `targets-robust`,
  `goal-owner-date`, `views-goals`, `goals-overview`, `decision-alert`, `board-why`, `work`: 256/256
  (`pw-logs/board-reader-green.txt`); `room-work`, `light-work`, `room-review`, `served-names`, `board-export`,
  `app-auth`: 78/78 (`pw-logs/board-reader-green-2.txt`).
- Unit: `features/work`, `work/planning`, `api`, `studio` 373/373. `fixture-boundary.test.ts` reads ServedWork's source
  for the board's reader; its pattern now names the reader where it runs (`readBoardView(value)`) and the call that
  gives it (`readBoard(identity.token, projectId, servedBoard(projectId)`), the same claim.
- Whole-repo `oxlint --type-aware` clean, `tsc --noEmit -p apps/studio` clean, Prettier clean on every touched non-docs
  file.

## Decisions and changes

- **The reader runs as the call's parser**, not as a check after it: `readBoard` takes the reader as an argument (the
  API module still imports nothing of the feature), and `servedBoard(projectId)` throws on the reader's refusal or
  another project's board. `readBody` turns that into `ApiError` `contract_violation` with the read's `retry`, exactly
  as the sibling reads' parsers do. One rule across reads, and TanStack's kept data gives the «board read once stays»
  behaviour for free.
- **The note's old limit is struck, not deleted**: `silent-views.md` had said, on purpose, that a refused board shows
  the goals alone; the new section says why that changed.

## After the independent review (no P1/P2; three points applied on this branch)

- **The boundary check is tight** (`13ee5aaa0`, test only): `fixture-boundary.test.ts` asked for `readBoardView(value)`
  anywhere in ServedWork; it now asks for it as the first statement of `servedBoard`, the parser the call is given.
- **A refusal of the reader is asked once per read** (test `6421a96bb`, fix `5c02580a6`). Retried, a lasting refusal
  meant four requests at each read (the half-minute look, each move, Try again) and seven seconds of «reading». The
  board's query now has `retry: retryBoard`: `retryRead` for everything, except an `ApiError` whose cause is
  `BoardRefused` (thrown only by `servedBoard`). A reply that isn't JSON is still retried. Red first
  (`pw-logs/board-reader-retry-red.txt`): «… keeps the plans, says nothing, and isn’t asked again» fails on
  `expect(await answered(page, 'malformed')).toBe(asked)`, «Expected: 1, Received: 2», 1.5 s after the first refused
  reply (TanStack's first retry at 1 s).
- **A kept board says nothing of its age** (plan `990a3c094`): written in `silent-views.md`'s Limits as a known
  trade-off (a refusal for good, a version skew, leaves the last accepted board on screen indefinitely with live
  controls and no line), with an «as of …» line (from `observed_at`) as the follow-up. No new UI.
- Static checks and unit (378/378, `account-cache.test.ts` included) green after these. E2E through the guard:
  `board-robust`, `search-goals`, `task-links`, `goals-overview`, `board-why`, `served-names`, `room-review` 61/61
  (`pw-logs/board-reader-review-green-c.txt`); `board-robust` repeated five times 25/25
  (`pw-logs/board-reader-review-repeat.txt`).

## Remaining obligations

- A board kept past failed reads says nothing of its age (above); follow-up «as of …».
- The remaining limits of `silent-views.md` stand (search's «nothing» with the board failed, Goals' overview glances,
  the brief's missing Try again).
- CI is the run on record.

## Next bounded action

- Luis: say whether this joins the next batch PR. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the follow-up list only.
