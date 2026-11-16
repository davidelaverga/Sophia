# Complete folds beside Blocked, so the other lanes keep their measure

> 2026-11-16 · informe-ui-premium (`evaluacion-2026-10-11/informe-ui-premium.md`), Tasks: at 1280 px with the Blocked
> lane showing, five equal lanes make tasks' titles wrap to two lines; fold Complete (a narrow column with its count,
> one press to open) while Blocked shows. Luis 2026-11-16: «es imposible que no se pueda avanzar mucho». Studio only,
> no API, no new words. Follows [board-blocked](board-blocked.md) and [board-why-blocked](board-why-blocked.md), which
> decided nothing about folding.

## Read first (`origin/main` `9495c87fc`)

- `board.css:239`: `.board-lanes` takes `repeat(var(--lanes, 4), minmax(0, 1fr))`, five while something is blocked
  (`PlanBoard.tsx`, `shownLanes`). `board.css:1460-1463`: under a board of 1148 px the five stand three and two.
- The board is never wider than about 1208 px: `.page` stops at `--content` (1280 px, `theme.css:185`), less its
  gutters. Measured on the Tasks fixture through the guard: the board is 1203 px at a 1280 px window, 1193 at 1440 and
  1184 at 1600 (the gutters grow). So the report's 1280 is where it was seen, not where it happens: **every** desktop
  window shows the five lanes at 227-231 px, and the same titles wrap at 1600 as at 1280.
- At 1280, five lanes: four of the seven titles take two lines («Review the retry’s candidate», «Write the export’s
  release note», «Measure render time on large reports»; and «Reproduce the failed render» from 1520 on). With Complete
  in a narrow column the other four lanes are 277 px and only «Measure render time on large reports» still takes two:
  its 211 px of title is short of it on the four-lane board too (227 px), so that wrap is the tile's, not the fifth
  lane's.

## What changes

- **When**: while five lanes stand in one row (the board over 1148 px, the same line as the three-and-two rule), the
  Complete lane folds. Under it (three and two, two, one, the phone) and on a four-lane board nothing folds. The board's
  width is read where the container query reads it (`.board`'s content box, a `ResizeObserver`), not the window's.
- **The folded lane**: a narrow column as tall as the lanes, its head a press: the lane's own mark, «Complete» and its
  count, written down the column. No new words: the press's name is the head's. Its tiles are not on the page.
- **Opened**: the press stays the head, across the lane as any head, its chevron turned; the five lanes stand equal as
  today; the same press folds it again. Folded or not is the board's moment (not remembered), as Closed work's fold is.
- **Keys**: the press is a button (Enter and Space); its focus stays on it both ways. The arrows go over lanes with
  tiles, so they pass a folded lane, as they pass an empty one. J and K in a sheet follow the plan's order, Complete's
  tasks among them, folded or not; H and S are the sheet's.
- **Focus never lost**: a focused tile that moves into the folded lane (completed in a live update) gives the focus to
  the fold's press (as a lane past five gives it to «Show N more»); the press itself, gone when the board narrows
  under the line, gives it to the lane's first tile, else the board's first.

## States

- Complete empty: it folds as well, its count 0.
- Blocked goes (its blocker completes): four lanes, nothing folds, Complete's tiles are back.
- A thread to a task in the folded lane is not drawn (no tile to end on); the task's own sheet names what it waits on.
- A report open beside Tasks narrows the board under the line: three and two, nothing folded.

## Checks (written first)

`e2e/board-fold.spec.ts` on the Tasks fixture (Blocked shows):

- 1280×800: Complete is a column under 48 px with its press «Complete 1», `aria-expanded` false, no tile in it; every
  other lane at 270 px or more; «Review the retry’s candidate» and «Write the export’s release note» on one line (line
  boxes counted with a `Range`), «Measure render time on large reports» on no more than its two. Enter opens it (its
  tile, focus on the press); Space folds it again; ArrowRight from the last tile before it stays put; J in a sheet
  reaches «Reproduce the failed render».
- 1600×900: folded as well, the board still under 1208 px.
- 1100×800 (three and two): nothing folds, Complete shows its tile.
- `@phone`: nothing folds, Complete shows its tile.

`work.spec.ts`' lane test opens the fold before reading Complete's tile; its other reads of Complete open it when it is
folded, so none of them passes on a lane it cannot see.

## Left

- The report's «at 1600 nothing folds» is not followed: the board is as narrow there (above).
- «Measure render time on large reports» still takes two lines: the tile keeps 66 px of a lane for its doer and
  padding. Not this change.

## After the fix

Seven more of `work.spec.ts`' checks met the fold at the suite's 1280 px: two count every tile (what changed while
away, the lenses), five reach the complete review (by its focus, or `openTask`). They open the fold first
(`unfolded`); what they assert is unchanged. The opened head first stood 10 px taller than the others (the kit's
`.ghost` height won over the fold's): the fold's own rules now name the head, and the five heads read 18 px at one top.
