# Handoff: Personal's day pill and its new day's answers stand on the press scale

Goal and attempt: PERSONAL-NEW-DAY-SCALE (Luis 2026-10-20, «Llevar a la escala», on the heights sweep of Personal's
new-day state), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-4`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-4`, branch `personal/new-day-scale` from `origin/main`
`a8a66d260` (R1 #470, R2 #472, groups 6–8 merged); not pushed
Writable scope: this worktree only (Studio CSS, its checks, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` / `pw-gentle.ps1` and
`.claude-guards/safe-run.ps1`).
Existing authority: Luis 2026-10-20, «Llevar a la escala» and «Procede con el próximo lote».
Ending commit: the branch's last commit. Against `a8a66d260`: `apps/studio/src/features/personal/personal.css`,
`apps/studio/e2e/{control-heights,personal-day-menu}.spec.ts`, `docs/plans/personal-new-day-scale.md`, this record.

## Outcome

- On a desktop the day pill is 28 px (was 26) and the three answers under her line of a new day («Light today»,
  «Steady», «Heavy today») are 36 px rows (were 44): both on the 24/28/32/36 scale. The pill's words and chevron stay
  centred (0 px off its middle, nothing overflows); its menu still hangs 6 px under it.
- A finger keeps its sizes: on a touch screen the rows stay 44 px with their 10 px padding (the places' touch block,
  where the pill already takes 40), so on a phone nothing moves. A first conversation's ways to start are the same
  `Ways` rows and move with the answers.
- Found while building: on a phone the days' menu opened 8 px over the 40 px pill's foot (6 px after the pill moved);
  on a touch screen it now hangs 6 px under it.

## Evidence

- Plan: `docs/plans/personal-new-day-scale.md` (`37c998dad`; «Found while building» added with this record).
- **Pair 1, written first** `3497e4db1` (`control-heights.spec.ts`, its own test at the end of the file: Personal at
  `at=00:04`, 1280×500 so the list scrolls and the pill shows; it asserts the pill and the three answers are measured,
  then the scale). Red (`pw-logs/new-day-scale-red.txt`): «26px .c3-daypill «Yesterday»», «44px . «Light today→»»,
  «44px . «Steady→»», «44px . «Heavy today→»». Fixed in `28c9ff612`.
- **Pair 2, written first** `4a2ff7e92` (`personal-day-menu.spec.ts`, `@phone`, at the end of the file). Red
  (`pw-logs/new-day-menu-red.txt`): «Expected: 6 · Received: -6». Fixed in `57f331ca7`.
- **Green at `57f331ca7`** (through `pw-gentle.ps1`, one worker; a two-worker run was stopped by the guard for low
  memory): `control-heights`, `personal`, `personal-day-pill`, `personal-day-menu`, `personal-first-talk`, desktop and
  phone, 127/127 (`pw-logs/new-day-scale-green.txt`); `phone-fits` 8/8 (`new-day-scale-phone-fits`).
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio`, Prettier on every touched non-docs file: clean.
- Captures (headless, `.claude-guards/safe-browser.cjs`, the fixture at `at=00:04`; desktop 1280×500, phone 390×844),
  in the session's scratchpad `new-day-scale/`: `{before,after}-{desktop,phone}-{dark,light}.png` and the open menu
  `…-menu.png`. Measured with them: desktop pill 26 → 28, answers 44 → 36, menu gap 6 → 6; phone pill 40 → 40, answers
  44 → 44, menu gap −8 → 6; dark and light the same.

## Decisions and changes

- **The answers' padding is 7 px**, not 8: each row carries a 1 px rule (the first, ruled above too, two), so 8 px made
  them 37 and 38. The minimum (36) sets the middle rows; the first is 36 by its padding.
- **The finger's size is the row's own height**, not an `::after` reaching past it (the `.text-button` pattern): the
  rows touch, and a target reaching into the next row would overlap its neighbour's. 44 px, as before and as asked,
  above the places' 40 px for pills.
- **The heights check is its own test, not a line in the pages' list**: at 1280×800 the shorter answers let the list
  fit, so the pill doesn't show and a page in the loop would pass without measuring it. At the end of the file (and the
  menu's at the end of its spec) so they merge cleanly beside the clock pinning on `ci/personal-fixture-clock`; both
  use the fixture's `at=00:04`, which that branch may pin another way.
- The pill's step-aside band (`PILL_BAND`, the mask's 68 px) and the dividers' `scroll-margin-top: 44px` are unchanged:
  the pill's foot moves from 36 to 38 px, still 6 px above a divider brought to the top.

## Remaining obligations

- None known in scope. CI runs the specs on the next group PR.

## Next bounded action

- Group with the next verified batch PR when Luis says; merge on green with no open P1.
- Source IDs consulted: none from the source register.
