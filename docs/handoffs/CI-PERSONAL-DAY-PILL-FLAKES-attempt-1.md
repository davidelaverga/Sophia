# Implementation-session handoff

Goal and attempt: CI-PERSONAL-DAY-PILL-FLAKES (three CI flakes in `personal-day-pill.spec.ts`, old lines 16, 32 and 78,
the last on 2026-10-17 23:46 UTC, run 39080296257; Luis 2026-10-20: «Procede con el próximo lote y arregla tú los de
Davide»; earlier «Lo que no se mide, no se puede mejorar»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-3`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-3`, branch `ci/personal-day-pill-flakes` from
`origin/main` `9a6b03a73` (not pushed)
Writable scope: this worktree only (`apps/studio/e2e`, `apps/studio/src/features/personal`, `docs/plans`,
`docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` / `pw-gentle.ps1` guard); CI as the run on
record.
Existing authority: Luis 2026-10-20, the quote above; local only, nothing pushed.
Ending commit/tree: `97e546808`, the last commit that changes code (after the review's P2: `5378043ab`, `97e546808`);
the next one updates only the note and this record. Files changed against `9a6b03a73`: `e2e/control-heights.spec.ts`,
`e2e/personal-first-talk.spec.ts`, `e2e/personal.spec.ts`, `src/features/personal/Find.tsx`,
`docs/plans/ci-personal-day-pill-flakes.md`, and this record.

## Outcome

- **The three flakes were the clock, not an animation, a scroll or a focus race, and main already fixed them.** All
  176 failed `ci.yml` runs since 10-12 were read: the three failed in five runs, every failing test between 00:03 and
  00:13 UTC. Runs that reached them at 00:19 and 00:22 passed. The personal fixture dates today's turns 14, 13 and 6
  minutes before its clock, the browser's (UTC in CI). Just after midnight they fall on yesterday, or the «Today»
  divider sits over the last turn, at the list's end, where `placeToday` cannot lift it. `01252cb16` (#438, merged
  2026-10-18 04:16 UTC) loads the spec at `at=12:00`; no failure since.
- **Four neighbours had the same cause and were still open.** Before 00:06 Personal shows the new day: the day pill
  names yesterday, the mood presses («Light today», «Steady», «Heavy today») sit under the talk, the list scrolls.
  `personal-first-talk` «a conversation in progress still rests on the field», `personal.spec` «a short conversation
  rests on the field» and «Ctrl F finds…» (all three failed in CI's 00:03 run on 10-17), and `control-heights` «on
  personal, every single-line press…» fail then. They now load the fixture at noon, as the day pill's, the days' menu
  and `menu-scale` already do. What each asserts is unchanged.
- **The midnight failures are not the product's:** at that hour nothing has been said today, and Personal says so.

- **Review P2: Find left its match out of sight in a talk that scrolls (a product bug, fixed test-first).** At noon
  the whole talk fits, so «Ctrl F finds…»'s in-view check held whatever Find did. A new check at a 480 px window, where
  the talk scrolls and the first «keep» is above what shows, failed: the current match stayed out of sight. A probe
  caught the order: Find's one smooth `scrollIntoView`, then the list's end-keeping `scrollTo` (its ResizeObserver,
  `PersonalSpace.tsx` `useEndKept`) twice as the finder's count came in, the list ending at its end; the same match
  stayed current while typing, so nothing brought it back. Find now scrolls the match into sight at once
  (`behavior: 'instant'`): the list reads the reader away from its end before it resizes again.

## Evidence

- CI: `gh run view --log-failed` for the 176 failed runs since 10-12 (saved under the session's
  `scratchpad/daypill-logs/`). Failing times: 38975614900 00:03 (4 × «no Today divider»), 38976088276 and 38978036610
  00:12, 39080233504 00:10, 39080296257 00:06 (crowding checks).
- Reproduced with the spec's address at a set hour (local, not committed): `at=00:03`, 4 of 4 fail with «no Today
  divider» (`pw-logs/daypill-red-0003.txt`); `at=00:06` and `at=00:08`, the same three fail on «toHaveAttribute
  data-crowded true» (`daypill-red-0006.txt`, `daypill-red-0008.txt`).
- Probe: at `at=00:06` and `at=00:13` the list is already at its end (`scrollTop` = max, 302 and 318). Asked for
  +20 px and −40 px, the divider stays 108 px and 32 px under the top (`pw-logs/daypill-probe.txt`).
- Green for the three on main as it stands: the spec `--repeat-each 20`, 80/80 (`pw-logs/daypill-green-x20.txt`). The
  phone project runs only `@phone` tests, so none of these four.
- Neighbours, red: the fixture's clock made 00:04 when no `at` is given (a local lever, reverted), every spec that
  loads `personal.html` run. Four failed: `control-heights` (+ «26px .c3-daypill «Saturday»», three «44px» mood presses),
  `personal-first-talk:37` («Received: 165.5», ≤ 64), `personal.spec:584` (gap null: the list scrolls),
  `personal.spec:906` («viewport ratio 0») (`sweep-0004-a/b/c.txt`). At 00:10 `personal.spec` 100/100 and the
  personal-* specs passed; the other chunks were cut by the memory guard (147 of 150 run, none failed).
- Neighbours, green at `f38d0ac8e`: with the lever at 00:04, the four, the pill's four and a phone check the filter
  caught, 5 of 5 each, 45/45
  (`daypill-fix-lever0004.txt`); without it, the four `--repeat-each 20`, 80/80 (`daypill-nb-green20-g3.txt`); whole
  specs `personal`, `personal-first-talk`, `control-heights`, `personal-day-pill`, `personal-day-menu`, desktop and phone,
  123/123 (`daypill-whole-g5.txt`).
- Whole-repo `oxlint --type-aware` (exit 0), `tsc --noEmit -p apps/studio`, Prettier on the three spec files: clean.

- Review P2, red at `5378043ab`: the new check on a wide screen failed 3 of 3, «viewport ratio 0» at the first match
  (`pw-logs/daypill-find-red4.txt`). Its @phone twin (390 × 600, opened from the head's Find) passed 3 of 3 before the
  fix: the phone did not meet the race, it stays as a guard. Probe log: `pw-logs/daypill-find-probe.txt`.
- Green at `97e546808`: the two new checks and Find's other four `--repeat-each 20`, 120/120
  (`daypill-find-green20.txt`); `personal`, `personal-find-ask`, `personal-first-talk`, `personal-day-pill`,
  `personal-day-menu`, `control-heights` whole, desktop and phone, 128/128 (`daypill-find-neighbours.txt`);
  `find-view.test.ts` 8/8; oxlint, tsc, Prettier clean.

## Decisions and changes

- **Per check, not the fixture's default.** Making noon the fixture's default when no `at` is given would end the
  whole family, but the product reads the real clock for «how long ago»: a fixed fixture clock would move other tests'
  texts by hours at most times of day. The precedent (`01252cb16`, `3f5ad2eee`, `personal.spec`'s exchange check,
  `menu-scale`) is per check.
- **One commit, not a pair.** The fix changes only addresses in tests; the red is the same tests with the clock set to
  00:04, run and quoted above, not a committed failing test.

- **Find's match comes at once rather than gliding.** Keeping the glide would mean Find telling the end-keeping the
  reader left, or the end-keeping guessing a glide in flight; at once is also how a browser's own find moves.
- **No `control-heights` row at 00:04 (review P3):** the new-day state cannot pass the scale today (the pill's 26 px,
  the mood presses' 44 px), so it stays in the follow-ups below.

## Remaining obligations

- The new-day state is measured nowhere: the day pill's 26 px is off the press scale (24, 28, 32, 36;
  `personal.css` `.places .c3-daypill { height: 26px }`), and the mood presses stand 44 px. For the follow-up list:
  meant or not is the kit's call.
- The personal fixture still reads the wall clock without `at`; a new check needing «Today» can meet midnight again.
  `chat-times.spec.ts` and `home-needs.spec.ts` assert «Yesterday» on other fixtures; not read here, none failed in
  the midnight runs.
- CI is the run on record.

## Next bounded action

- Luis: say whether this joins the next batch. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and CI's logs only.
