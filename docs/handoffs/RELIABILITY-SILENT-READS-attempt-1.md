# Implementation-session handoff

Goal and attempt: RELIABILITY-SILENT-READS (the reliability baseline's gap #4, «lecturas que degradan a vacío en
silencio», `evaluacion-2026-10-19/fiabilidad/linea-base.md` §1.1 and §5; Luis 2026-10-19: «quisiera trabajar en la
fiabilidad y resiliencia. Ahí tendríamos que también medir. Lo que no se mide, no se puede mejorar» and «Procede con el
script de medición y el lote R1»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-7`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-7`, branch `reliability/silent-reads` from the local
`group/follow-ups-5` `56c61c61e` (stacked on #468; not pushed)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard); CI as the run on record.
Existing authority: Luis 2026-10-19, the quotes above; local only, nothing pushed.
Ending commit/tree: `e8eb00112e5e` (tree `1b0e33aaa4e0`), the last commit that changes code, after the independent
review's P2 (below); the next one updates only the note and this record. Files changed against `56c61c61e`: `e2e/goal-owner-date.spec.ts`, `fixtures/fixture-api.ts`,
`fixtures/room.tsx`, `src/features/work/GoalTargets.tsx`, `docs/plans/silent-reads.md`, and this record.

## Outcome

- **One of the baseline's reads shows a false «none»: the goal sheet's owner and date.** Now, when the targets or the
  members read fails with nothing kept, the sheet says «The owner and date can’t be read right now.» with Try again,
  as an alert, in place of the form or the words. Try again reads again whichever failed. Once a read takes, the owner
  and date are back.
  - Before: a viewer read «Owner · none · Target date · none». An admin was offered only «No owner», shown selected
    even where the goal has an owner, and an empty form would save against revision 0.
- `useMembersRead` says how the members read stands (`notesRead`), as `useTargetsRead` does for the dates.
  `useMembers` stays for the overview's rows and the invite sheet. `useGoalTargets` had one caller, the sheet, and is
  gone.
- **The other ten were read in the code and judged decorative.** A failure there leaves a band or an offer undrawn,
  or true fallback words, and nothing claims «none». The note's table gives each one's reason: `FromYourProjects`,
  `InProject` (same members read), `CatchUp`, `StagePresent`, `NewConversation`, `ReviewSources`, `source-origins`,
  `WelcomeBand`, `InvitedBand`, `ContinuityChoice`. `Archive.tsx` was skipped, as asked: the archive branch changes it.
- **Where this differs from the baseline:** its heuristic named `GoalTargets.tsx:41-46` (members). The code shows the
  sheet's targets read as the same harm: `useGoalTargets` dropped the read's state, so the sheet said «none» while the
  overview above it already said the dates failed.

## Evidence

- Note committed first (`65159675f`).
- **Written first and failing** (`920713c32`; log `pw-logs/silent-reads-red.txt`): 2 failed, 3 passed.
  - Both new checks fail on the missing line: «Expected substring: "The owner and date can’t be read right now."»,
    «element(s) not found».
  - The page snapshots at the failure show the harm itself:
    - the admin's sheet: `combobox "Owner"` with `option "No owner" [selected]` and nothing else;
    - the viewer's sheet: `paragraph: Owner · none · Target date · none`.
  - New lever in the same commit: `membersRead=fail` and `window.fixture.failMembers`, answering the members read with
    the API's `unavailable`, as `targetsRead=fail` does.
- Fix `ccdf5adbe`. Green through the guard:
  - `goal-owner-date`, `targets-robust`, `goal-overdue`, `goal-notes`, `goals-overview`, `member-roles`,
    `remove-member`: 39/39 (`pw-logs/silent-reads-green.txt`).
  - `views-goals`, `goal-controls`, `goal-address`, `search-goals`: 20/20 (`pw-logs/silent-reads-green-2.txt`).
- Unit `goal-notes.test.ts` 9/9 (`notesRead`, the state both reads use, is unchanged).
- Whole-repo `oxlint --type-aware` (0 diagnostics, 1372 files), `tsc --noEmit -p apps/studio`, and Prettier on the four
  touched non-docs files: clean.

## Decisions and changes

- **One line for both reads.** Without the members, the owner can't be named or chosen. Without the targets, the form
  would save against the wrong revision. Neither half can be drawn honestly, so the section says one thing.
- **The area's words.** «… can’t be read right now.» with a text-button Try again, as the overview («The dates can’t be
  read right now, so an overdue goal may be missing.») and the notes («Notes can’t be read right now.») say it. No new
  idiom and no new CSS: `.goal-target p` already sets the paragraph.
- **A later failure with a list kept (`stale`) keeps what was read**, as the overview does. As first written this held
  for the targets only until the project moved; the review section below fixes it.
- **One test-first pair.** Both reads are the same section with the same pattern. The ten decorative reads change
  nothing, so they have no tests.

## Remaining obligations

- While the reads first come in, the sheet still draws its empty form or «none» for a moment. That is a loading state,
  outside this change (the note's limits).
- `InProject` is the closest call among the decorative ones. A project always has at least its viewer, so an empty list
  can only be unread. An admin who opens the invite sheet to change a role then finds no list and no reason. It is a
  candidate for the same line in its own change.
- The baseline's M6 sweep (`outage(true)` across every view) is not part of this change.
- CI is the run on record.

## Next bounded action

- Luis: say whether this joins the R1 batch PR. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the baseline only.

## Independent review: a kept read must outlast the project's moves

- Source: the independent review of this branch, no P1, one P2 (`GoalTargets.tsx` ~26-33), verified in the code and
  in TanStack: a placeholder is used only while a query is pending. The targets are keyed by the project's cursor. After
  any project event, a failing read at the new cursor had no data and read as `failed`. The sheet then swapped the
  owner and date on screen for the alert and unmounted an admin's unsaved edit. This contradicted the line above.
- Commits, same branch and worktree, local only:
  - `2209ab738`: test, failing.
  - `e8eb00112`: fix.
  - Then the note's review section and this record.
- **Outcome** (`useTargetsRead`): each cursor's read starts from the newest targets read for the project and viewer
  (`initialData` from the query cache, with that read's `initialDataUpdatedAt`, so it is stale and read at once). A
  failure after a move is `stale`: the sheet and the overview keep the owner, the date and any typed edit. Only a read
  that never answered is said. `keepPreviousData` is gone from this read; the seed covers it.
- **Evidence.**
  - The new check: an admin with the owner shown types a date; the targets fail; `fixture.say` moves the project; the
    spec waits for four `targets-refused` (the fixture now records each). Expected: no alert, owner still Marco, the
    typed date kept.
  - Red at `2209ab738` (`pw-logs/silent-reads-moved-red.txt`): 1 failed, 5 passed.
    - Failure: `section.getByRole('alert')` «Expected: 0», «Received: 1».
    - The page snapshot shows the region «Owner and date» holding only the alert «The owner and date can’t be read
      right now.» and Try again. The form and the typed date are gone.
  - Green through the guard at `e8eb00112`: `goal-owner-date`, `targets-robust`, `goal-overdue`, `goal-notes`,
    `goals-overview`, `member-roles`, `remove-member`, `views-goals`, `goal-controls`, `goal-address`,
    `search-goals`: 60/60 (`pw-logs/silent-reads-moved-green.txt`).
  - Unit `features/work/*.test.ts` 48/48.
  - Whole-repo `oxlint --type-aware` (0 diagnostics), `tsc --noEmit -p apps/studio`, and Prettier on the touched
    non-docs files: clean.
- **Decisions.**
  - **Seed rather than an unkeyed read.** The cursor stays in the key, as the notes key it.
    - Taking it out and invalidating on each move needs the effect in both readers, the overview and the sheet. Each
      move would then read twice, or need a shared record of which move was read.
    - A last map kept in a ref is per component, so a sheet opened after the failure would have nothing to keep.
  - The seed is read through `getQueryData<GoalTargetList>`, not a cast: lint refuses the unsafe assertion.
  - **The optional P3 is left out** (Try again shown busy during its retries). The overview's `ReadFailed` doesn't do it
    either; the two should change together.
- **Remaining.**
  - The notes (`useLedger`) keep the same cursor key with `keepPreviousData`, so the overview's notes alert can come up
    the same way after a move. Outside this change; a candidate for the same seed.
  - CI is the run on record.
