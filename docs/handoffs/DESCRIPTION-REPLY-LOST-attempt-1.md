# Implementation-session handoff

Goal and attempt: DESCRIPTION-REPLY-LOST (Luis 2026-10-18: «Que sigue>», after «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando»; seam #9 of `evaluacion-2026-10-18/experiencia/costuras.md`), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-4`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-4`, branch `seams/description-reply-lost` from `origin/main` (`2e151c934`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the guard, `.claude-guards/safe-run.ps1`, two workers); CI as the
run on record.
Existing authority: Luis 2026-10-18, «Que sigue>», after «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando»: local only, no push and no PR until he says. One PR.
Ending commit/tree: `9ef7d0e51f2e` (tree `28ec6cbf621e`), the last commit of `seams/description-reply-lost`'s own that changes code (the later commit touches only this record). 9 files changed against `2e151c934` at that commit: `e2e/knowledge-quiet.spec.ts`, `e2e/report.spec.ts`, `fixtures/fixture-api.ts`, `fixtures/room.tsx`, `src/features/artifacts/SummaryEditor.tsx`, `src/features/artifacts/artifacts.css`, `src/features/artifacts/report-view.test.ts`, `src/features/artifacts/report-view.ts`, `docs/plans/description-reply-lost.md`. The review notes below name the commit of each later change.

## Outcome

- Before, a description save whose reply was lost kept the form open under «No reply from Sophia: it may have been saved…», even after the cards read back the words sent. A second Save was refused as stale and said «Someone changed this description since you opened it. Theirs is shown…», about the person's own save. Now, when the cards read back the words sent, the form closes and the line says «Saved. The reply was lost on the way, but the description reads as you wrote it.» It is a polite status (`role=status`) in the attribution's ink, not the rose alert. A stale refusal whose current text is the person's says the same line.
- «Someone changed this description to “…” since you opened it. Save to use yours instead.» shows only when the description now reads other words, and names them (review round 1). The typed words then stay in the field, and Save puts them over the revision now read, as ProfileSheet does with a name. Before, the form closed and the words were lost.
- Said once, and only while true: Edit clears the line, but not a save still waiting to be heard, and starts from the last words sent while one is. Cancel or Esc take the form's line with them, unless a save still waits to be heard. The saved line and the conflict line go once the card reads otherwise. The focus goes back to Edit only when the form had it.

## Evidence

- Written first (commit `f92928079`). The unit file fails to load with «SyntaxError: The requested module './report-view.ts' does not provide an export named 'SUMMARY_KEPT'». Through the guard at that sha, the four browser checks fail for the right reason. The lost reply and the stale save whose words are the person's both get «Expected: "status" … element(s) not found» (no saved line). The conflict gets «Expected: "Someone changed this description since you opened it. Cancel to see theirs, or Save to use yours." Received: "Someone changed this description since you opened it. Theirs is shown; edit again if you need to."». `report.spec.ts`'s conflict check gets «toHaveValue … Expected: "My own description" … element(s) not found», because the form closed.
- At the fix (`9ef7d0e51`), `report-view.test.ts` passes 54/54. Studio unit tests pass 1774/1776. The two failures are the Windows path ones (`attention.test.ts`, `browser-imports.test.ts`).
- Playwright through the guard at the fix: 140/140 across knowledge-quiet, knowledge-quiet-two, report, knowledge-honest, knowledge-library, knowledge-filters, knowledge-origins and room-made. The four new or changed checks also passed 30/30 with `--repeat-each=5`.
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio` and Prettier on the touched files: clean.
- Captures in the session scratchpad, `seams-description-reply-lost/`, at 1280×800 dark and 390×844 light: `kept-*` (the saved line on the closed card) and `conflict-*` (the conflict with the typed words in the field), each as the page and as the tile. Horizontal overflow is 0 in all four. The saved line is 259 × 40 px at 1280 and 328 × 40 at 390. The conflict line is 259 × 60 and 328 × 40.

## Decisions and changes

- Brief against code: the claims hold on `2e151c934`. Only line numbers moved: `problemOf` is at `SummaryEditor.tsx` 36-45, `save` at 90-103, `editReportSummary` at `api/artifacts.ts` 72-73, and `edited()` at `fixtures/fixture-api.ts` 1470. `window.fixture.describeElsewhere(text)` already existed (`fixtures/room.tsx`). The API trims with `btrim`, after `summaryEdit` has trimmed, so the card reads back exactly the words sent.
- The decision is pure and tested (`report-view.ts`'s `settleUnheard`). It takes the save that was never heard (the words sent and the revision they were sent against), the card and the form's text. A card at that revision settles nothing, even with the same words. The words live beside it (`SUMMARY_KEPT`, `SUMMARY_THEIRS`).
- `SummaryEditor`'s `useSave` holds the line, the save and the unheard save. An effect settles the save as the card changes. A stale refusal says nothing until the cards settle it, and a card already newer settles it at once. Words typed after a lost save stay, over the new revision, under the saved line.
- The conflict's second sentence changed, because «Theirs is shown» is no longer true while the form stays open. `report.spec.ts`'s conflict check now expects the typed words to stay, and Cancel to show theirs with the focus back on Edit.
- The lever is the one the report names: `room.html?place=knowledge&summary=lost` applies the first edit, then rejects with a `TypeError` instead of answering, as the other lost-reply levers do. The stale path whose words are the person's uses `describeElsewhere` with the same words before Save.

## Remaining obligations

- Words sent from another tab read the same as a lost reply here: the card reads them, so the line says saved.
- A card read that fails right after a stale refusal leaves the form open with no line. Save asks again, and the next read settles it.
- The `PATCH` still has no Idempotency-Key (costuras, «Dónde lo sabe»). That is the API's to change, not this seam's.
- After two unheard saves, if the card reads the first while the field holds the second, the saved line shows over the open form. The first save landed, and the second is offered again over the revision now read.
- The conflict line names the teammate's words in full (up to 240 characters), so it can run to three lines on a phone.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and `evaluacion-2026-10-18/experiencia/costuras.md` (its intro and seam #9).

## Review notes

- **Review round 1: five P2s, all real.** Verified against the code, then answered in one fix commit (`59b7809fe`) after a failing one (`db002eaf1`).
  - **P2 (two reviewers), a second Save or Cancel→Edit before the read:** `save` replaced the unheard save with the latest words (`setUnheard({ sent: edit.summary, … })`), and `begin()` dropped it, so when the first save's words came back, `settleUnheard` compared them with the second's and said «Someone changed…». Now `unheardWith` keeps every text sent while unheard against the same revision, and any of them on the card is the person's own. Edit keeps what is unheard and starts from the last words sent (`draftFrom`).
  - **P2, Save over words not shown:** the open form showed only the field and the line, so «Save to use yours» replaced a teammate's description unseen, and Cancel to see it lost the typed words (`edit_report_summary` keeps no history). The line now names theirs, as `conflictWords` does: «Someone changed this description to “A teammate’s description” since you opened it. Save to use yours instead.» A long description runs to three lines on a phone, and that is in the plan's limits.
  - **P2, the saved line outliving its truth:** after a teammate's later edit, read on focus, the closed card still said «…reads as you wrote it». Each line that speaks of the description now carries the words (`reads`), and `liveNote` drops it once the card reads otherwise.
  - **P2, a stale refusal unpinned:** the check for «never Someone changed» ran only after the saved line appeared. `problemOf` is now `summaryProblem` in `report-view.ts`, with a unit check that `stale_revision` gives null. The browser checks also record every line as it appears (a `MutationObserver` set before the page loads). With the mutant (stale → the old words), the unit fails («never «Someone changed…» before the text is known») and so does the stale-save check, with `Received: ["Someone changed this description since you opened it. Theirs is shown; edit again if you need to."]` (`pw-logs/seam9-r2-mutant.txt`).
  - New lever: `window.fixture.holdReports()` / `releaseReports()` hold Knowledge's card reads, then answer them with the cards as they are, as a slow API does.
- Red at `db002eaf1`:
  - `report-view.test.ts` does not load: «does not provide an export named 'draftFrom'». With the branch's earlier behaviour behind the new names (a scratch shim, never committed), six cases fail on their assertions. For example, two saves keep only `[ 'My sharper description, again' ]`; Edit starts from `'Sophia’s description'`; the conflict reads «…Cancel to see theirs, or Save to use yours.»; the saved line stays for `'A teammate’s description'`.
  - Through the guard (`pw-logs/seam9-r2-red.txt`): 5 failed and 8 passed. The second Save got `Received: "Someone changed this description since you opened it. Cancel to see theirs, or Save to use yours."` where the saved line was expected. Cancel→Edit got `Received: "A labelled fixture report, as Sophia described it."` in the field. The saved line after a teammate's edit got `Expected: 0 Received: 1`. The conflict, in both knowledge-quiet and report.spec, did not name the teammate's words.
- Green at `59b7809fe`:
  - `report-view.test.ts` passes 58/58. Studio unit tests pass 1778/1780; the two failures are the Windows path ones.
  - Through the guard, 142 of 143 checks passed across knowledge-quiet, knowledge-quiet-two, report, knowledge-honest, knowledge-library, knowledge-filters, knowledge-origins and room-made (`seam9-r2-green.txt`). The one failure was `report.spec` CX-0026 @phone, «the fixture page did not start», which has nothing to do with the description. Run again alone, CX-0026 passed 12/12 (`seam9-r2-cx0026.txt`).
  - The seven description checks passed 35/35 with `--repeat-each=5` (`seam9-r2-repeat.txt`).
  - Whole-repo `oxlint --type-aware` (exit 0; it reported two errors in the new checks before they were fixed), `tsc --noEmit -p apps/studio` and Prettier on the touched files: clean.
- New captures in `seams-description-reply-lost/`: `named-*` (the conflict naming the teammate's words) and `second-save-*` (the saved line over an open form holding the words typed since), each as the page and as the tile, at 1280×800 dark and 390×844 light. Horizontal overflow is 0 in all four. The named line is 259 × 60 px at 1280 and 328 × 60 at 390.
