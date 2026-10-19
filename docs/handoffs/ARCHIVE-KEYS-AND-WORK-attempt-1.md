# Implementation-session handoff

Goal and attempt: ARCHIVE-KEYS-AND-WORK (three Codex P2s on #368, verified still open by the triage
`evaluacion-2026-10-16/seguimientos-triage-2026-10-19.md`: «Keep the archive retry key beyond the sheet lifetime» with
«Reuse the unarchive key after a lost reply», «Track the Work-side unarchive mutation», «Surface failures from the
archived-project read»; Luis 2026-10-19: «Entonces sigue trabajando en lo que viene mientras esperamos»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-4`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-4`, branch `archive/keys-and-work` from the local
`group/follow-ups-5` (`56c61c61e`, not pushed; it stacks on #468 `group/seams-4`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no contract.
Runtime unit: Luis's Windows host (Playwright through the session's guard `pw.ps1` → `.claude-guards/safe-run.ps1`,
two workers); CI as the run on record.
Existing authority: Luis 2026-10-19, as quoted; local only, nothing pushed; merges on green with no open P1 once
pushed.
Ending commit: `0cfcd3518`, the last commit that changes code or checks (the review round); the next one updates only
this record and the plan. First round ended at `0431dbbf6`. One branch, local; it can join the next batch PR.

## Outcome

- An archive or an unarchive whose reply never came goes again under the same Idempotency-Key, wherever it is pressed
  again: the sheet put away and opened again, the line inside the project, or Work's row. The API answers the first
  write instead of recording a second.
- In Work's «Archived», Unarchive now waits on its row: «Bringing back…», marked `aria-disabled`, and a second press
  sends nothing. A failure is said under the row until the next press, instead of a toast that goes.
- When the archived list can't be read, Work says «Couldn’t load your archived projects.» where «Archived» goes, with
  Try again, instead of drawing nothing as if none were archived. Inside a project nothing changes.

## Evidence

- Plan: `docs/plans/archive-keys-and-work.md` (committed before the tests, `5f3f94f53`).
- Aion 2 was open from 10:51; the guard waited 3512 s and the runs went at 12:21. Every run went through `pw.ps1` at
  the commit named, detached for the red ones; logs in the session's `scratchpad/pw-logs/`.
- **Item 1, the keys:**
  - written first and failing (`3ccf7eda4`): `archive-project.spec.ts` 2 failed, 8 passed, both on
    `expect(received).toBe(expected)`. The sheet opened again sent `477b078c-…` after `92dc9d6a-…`; Work's second
    Unarchive sent `6209449c-…` after `7d6c2e8e-…`. Log `archive-keys-red-1.txt`;
  - fixed (`3610c3436`): 10/10, log `archive-keys-green-1.txt`. Unit `archive-keys.test.ts` 4/4.
- **Item 2, Work's tracked Unarchive:**
  - written first and failing (`268d8ca27`): 2 failed, 10 passed. Held: `toHaveAttribute('aria-disabled', 'true')` on
    «Bringing back…», «element(s) not found». Refused: `toHaveText` «That didn’t go through. Try again.» on the row's
    alert, «element(s) not found». Log `archive-keys-red-2.txt`;
  - fixed (`5ea7a4551`): 11 passed, 1 failed: the held check, on its own second press. `locator.click` timed out on
    «element is not enabled», because Playwright counts `aria-disabled` as disabled. `0431dbbf6` presses it with
    force, as `conversations-decide` and `personal-carry` do. Its red run had failed earlier, on the missing «Bringing
    back…», so that proof stands. Log `archive-keys-green-2.txt`.
- **Item 3, the read's failure:**
  - written first and failing (`3125a7d3b`): the Work check failed on `expect(locator).toBeVisible()` for the alert
    «Couldn’t load your archived projects.», «element(s) not found». The guard inside the project passed, as expected
    (it already held). The held check's force press wasn't in yet, so it failed as above. Log
    `archive-keys-red-3.txt`;
  - fixed (`4ff850b88`).
- **After all:**
  - neighbours at `4ff850b88`: `archive-project`, `app-auth` (the app's own Places, over `fixture-api.ts`),
    `project-leave`, `project-rename`, `project-activity`, `room-updates`, `home`, `spaces-honest`, `phone-fits`:
    116 passed, 1 failed, the same force press. Log `archive-keys-neighbours.txt`;
  - at `0431dbbf6`: `archive-project` with `app-auth` 53/53, log `archive-keys-green-final.txt`;
  - unit: the Studio suite 1910/1912; the two failures are the known Windows ones (`attention.test.ts`,
    `browser-imports.test.ts`);
  - `tsc --noEmit -p apps/studio`, Prettier on every touched non-docs file, and whole-repo `oxlint --type-aware`:
    clean.
- **Captures** (a throwaway spec, deleted), 1280×800 dark and 390×844 light, on Work's own page: «Bringing back…» on
  the row, the refusal under the row, and the read's failure where «Archived» goes. 0 px horizontal overflow on the
  page, the list, the fold, the row and the notice in each. In the session's scratchpad, `archive-keys-and-work/`.

- **Review round (one P2, real):** an unanswered key outlived the other choice landing. An archive whose reply was
  lost but landed kept its key; once the project was brought back from the line or Work, pressing «Archive project…»
  again reused that key, and migration 0059 answers a reused key with its first receipt (`ON CONFLICT … DO NOTHING; IF
  NOT FOUND THEN … RETURN prior.receipt`, no end): the sheet would close as if archived while nothing changed. The
  mirror held for Unarchive.
  - written first and failing (`19b512dd3`, unit `archive-keys.test.ts`): 4 passed, 1 failed, «one choice landing
    lets go of the other’s unanswered key», `AssertionError: archived again, not answered with the lost archive’s
    receipt`, `actual: 'k1'`, operator `notStrictEqual`. The old case «settling one choice leaves the other’s key»
    asserted the faulty rule for a landing; it now covers only a refusal or no reply;
  - fixed (`0cfcd3518`): `settled` with no failure also deletes the key for `archived: !choice.archived`. Unit 5/5;
    `archive-project` with `app-auth` through `pw.ps1` on the branch at `0cfcd3518`: 53/53, log
    `archive-keys-review-1.txt`; tsc, Prettier and whole-repo oxlint clean. Nothing visible changed, so no new
    captures.

## Decisions and changes

- **Checked against the code first:** the three items held on the branch as the brief quoted them; only the line
  numbers had moved (`Places.tsx`'s `Work` is at ~514-527, not ~503).
- **One store for the page, not a new pattern:** `archive-keys.ts` has the shape of `removal-keys.ts` (a key per thing
  while unsettled), kept at module level as the page memories are (`page-memory.ts`), keyed by account, project and
  choice. Its rule is the one in `api/README` and `held-write.ts`: a key is kept after `retry: same_admission_key` (or
  a failure that isn't an `ApiError`), and let go once answered, landed or refused. Migration 0059 raises a refusal
  before it stores a receipt, and holds the project row `FOR UPDATE`, so the same key in flight twice is answered
  once.
- **Work's tracking goes through `usePresses`**, as Take back does, with the failures in a map by project. The words
  are the line's (`failure(err, UNARCHIVE_FAILED)`: the API's words, else «Couldn’t bring the project back. Try
  again.»), so the line and Work say the same thing for the same write. A lost reply says «No reply from Sophia», as
  the sheet and the line do. The row's failure is a `form-error` under the row, as a failed removal is in «In this
  project»; `.c3-archived-list li` wraps for it.
- **`useArchivedWork(identity)`** in `Archive.tsx` is what Places hands `WorkSpace` as `archived`; its type,
  `ArchivedWork`, lives there too. `useUnarchive` and `useArchivedProjects` are gone. `useIsArchived` reads the same
  query, and its comment now says a failed read claims nothing.
- **The read's failure** uses `READ_FAILED.archived` and `FailedReads`, the failed half of `ReadNotes`, taken out so
  the fold doesn't add a second slow note under the projects' own.
- **Fixtures:** Work's own page (`work-space.tsx`) now hands `WorkSpace` the Studio's own hook over an API answered in
  the page. It has levers `unarchive=lost|hold|fails` and `archivedFails=1`, and records each POST's key. The room
  fixture gains `archivedFails=1`: `fixture-api.ts` refuses the read with the API's own `unavailable` answer and
  records `projects:archived:refused`. The room-side key check wraps the page's own fetch in the spec, as
  `room-return.spec.ts` does.
- **Tests first, one pair per item, plus one check fix.** The browser checks were written first. The store's unit test
  came with its fix: before it the module didn't exist, and a red that only says «module not found» proves nothing.
  The force press is its own commit (`0431dbbf6`) rather than a rewrite of the test commit, so the red runs keep the
  commits they ran at.
- Untouched, as asked: the sheet's Cancel during «Archiving…» and Work's empty state with archived projects.

## Remaining obligations

- Suppose a reply is lost after the write landed, then another admin undoes it, then this person presses again. The
  API answers with the first receipt, and nothing changes. The lists are read again, so the page shows the truth. When
  this person undoes it themselves, the key now goes (review round). Letting go on the feed's `project.archived` /
  `project.unarchived` would close the other admin's case too; not done here.
- The store lasts as long as the page and is keyed by account. A reload starts afresh. A retry after signing out and
  back in as the same account is the same write.
- After Unarchive lands, its row leaves and the focus falls to the page, as before. Take back sends it to Work's
  heading.
- Other #368 items stay on the triage's list (the capped list, the closed sheet's redirect, carried notes).

## Next bounded action

- Luis: say when to push (it can join the next batch PR); then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository and the triage.
