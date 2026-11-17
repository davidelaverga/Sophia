# Handoff: Complete folds beside Blocked so task titles keep their line

Goal and attempt: BOARD-FOLD-COMPLETE (informe-ui-premium, `evaluacion-2026-10-11/informe-ui-premium.md`: at 1280 px
with Blocked showing, five equal lanes wrap the tasks' titles; fold Complete), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-9`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-9`, branch `work/board-fold-at-1280` from `origin/main`
`9495c87fc`; not pushed
Writable scope: this worktree only (Studio code and checks, `docs/plans`, `docs/handoffs`); no API; nothing deployed,
no remote touched.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1`, and `pw-direct.ps1` while WoW was open
and Aion 2 was not).
Existing authority: Luis 2026-11-16, «es imposible que no se pueda avanzar mucho».
Ending commit: the branch's last commit; code last changed at `4b06c4e6a`. Against `9495c87fc`:
`apps/studio/src/features/work/planning/PlanBoard.tsx`, `apps/studio/src/features/work/planning/board.css`,
`apps/studio/e2e/board-fold.spec.ts` (new), `apps/studio/e2e/work.spec.ts`; `docs/plans/board-fold-complete.md` (new),
this record.

## Outcome

- While five lanes stand in one row (the board over 1148 px, the line `board.css` already uses for three and two),
  Complete folds to a column under 48 px, as tall as the lanes: its mark, «Complete» and its count written down it.
  That head is a button (`.lane-fold`, `aria-expanded`); Enter or Space opens the lane (five equal lanes, as before,
  the head across it with its chevron turned) and folds it again; the focus stays on it. No new words.
- The other four lanes go from 231 to 277 px at 1280: «Review the retry’s candidate» and «Write the export’s release
  note» take one line again.
- Keys: the arrows pass the folded lane as they pass an empty one; J and K in a sheet still reach its tasks; H and S
  unchanged. A tile completed while focused hands the focus to the fold; the fold, gone when the board narrows, hands
  it to Complete's first tile, else the board's first.
- Three and two (board 1148 px and under), two, one, the phone, and any four-lane board: nothing folds.

## Deviations from the brief (checked against the code)

- **Not only at 1280.** `.page` stops at `--content` (1280 px, `theme.css:185`), so the board is 1203 px at a 1280
  window, 1193 at 1440 and 1184 at 1600 (measured through the guard). Five lanes are 227-231 px at every desktop
  width, and the same titles wrapped at 1600. So it folds at 1600 too; the check reads it there with the board under
  1208 px. «Nothing folds» is checked at 1100 (three and two) and on the phone instead.
- **One title still takes two lines.** «Measure render time on large reports» has 211 px of title in a 277 px lane;
  on the four-lane board it has 227 and wraps as well. The check allows it its two and says why.

## Evidence

- **Read first:** `board.css:239` (`repeat(var(--lanes, 4), …)`), `:1460-1463` (three and two under 1148 px); no plan
  in `docs/plans` decided anything about folding (`board-blocked.md`, `board-why-blocked.md`).
- **Written first** `c003db923`: through the guard (`pw-logs/fold-red`), 3 failed, 4 passed: the 1280, 1600 and keys
  checks at «Locator: …getByRole('region', { name: 'Complete', exact: true }).getByRole('button', { name:
  /^Complete\s*1$/ }) … Error: element(s) not found»; 1100 and phone passed, pinning today's behaviour.
- **Fixed** `4b06c4e6a`. A first green run (`fold-green`) found seven more `work.spec.ts` checks meeting the fold at
  the suite's 1280 px (two counting every tile, five reaching the complete review); they open it first (`unfolded`),
  their assertions unchanged.
- **Green** at `4b06c4e6a`: board-fold, work, board-why, task-keys, board-robust, light-work, 243/243
  (`fold-green-3`, pw-direct while WoW was open, Aion 2 not).
- Screenshots (headless, dark) of the folded and opened board: the heads at one top, 18 px each, after the fold's
  rules were given the head's specificity (the kit's `.ghost` 28 px height had won).
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio`, Prettier on the four touched non-docs files: clean.
  `plan.test.ts` 41/41.

## Remaining

- A thread to a task in the folded lane is not drawn (no tile to end on).
- Folded or not is the board's moment, not remembered across visits (as Closed work's fold).
- The fold's width line (`FIVE_IN_A_ROW`, 1148) is written in `PlanBoard.tsx` beside the container query that holds
  it in `board.css`; changing one needs the other.

## After the independent review (no P1/P2; four asks)

- **A folded task's sheet gives the focus back to its fold.** Opened from the address (`#task-work-0a`), its opener is
  the page, so `backTo` (`TaskSheet.tsx`) looked for the tile, found none and gave the board's first tile. It now
  tries the task's own lane's fold (`laneOf(row, rows)`, `.lane[data-folded] .lane-fold`) before the board's first.
  Written first `a4a1f88ad` (`pw-logs/fold-red-2`): 1 failed, 5 passed, «expect(locator).toBeFocused() failed …
  Received: inactive».
- **One threshold, CSS holds it too.** The folded grid sits in `@container board (width > 1148px)`, so the fold never
  squeezes a narrower board whatever the script says; `useFold` reads the board's width unrounded (its box less padding
  and border, then the observer's `contentRect.width`), against the same `FIVE_IN_A_ROW`.
- **«Complete 1».** The spec now asks for that exact name; it already passed in the red run (the browser puts a space
  between the head's flex items), so no change was needed in the code.
- **`unfolded()`** waits for `.board-lanes[data-lanes]` and reads until the lanes stand open, not after one count.
- **Not done, by choice:** a pulse on the folded count when a task completes (no motion change without Luis), and the
  lens counts' note from the review: both left for Luis.
- **Green not yet run for this round**: the guard refused for memory for 90 minutes (free RAM 4.4-7.1 GB; one run
  started and was stopped by it at test 10 of 247, `fold-green-4`), and WoW was not open, so pw-direct did not apply.
  `tsc`, whole-repo `oxlint --type-aware` and Prettier are clean. Run board-fold, work, board-why, task-keys,
  board-robust, light-work and task-links through the guard before merging.
- **pw-direct** was used twice in the first round (the screenshots and `fold-green-3`), each time right after
  `tasklist` showed `Wow.exe` running and no Aion 2 process.
