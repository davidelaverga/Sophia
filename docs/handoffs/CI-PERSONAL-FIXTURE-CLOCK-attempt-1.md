# Handoff: personal's checks read the same day at any hour of the run

Goal and attempt: CI-PERSONAL-FIXTURE-CLOCK (the midnight-UTC family of CI flakes on the personal fixture, after
`docs/plans/ci-personal-day-pill-flakes.md` and its Limits, #438 and #473; Luis 2026-10-20: «Procede con el próximo
lote» and «arregla tú los de Davide»; earlier «Lo que no se mide, no se puede mejorar»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-3`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-3`, branch `ci/personal-fixture-clock` from `origin/main`
`a8a66d260`; not pushed
Writable scope: this worktree only (`apps/studio/fixtures`, `apps/studio/e2e`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` / `pw-gentle.ps1` guard); CI as the run on
record.
Existing authority: Luis 2026-10-20, the quote above; local only, nothing pushed.
Ending commit: the branch's last commit; code last changed at `d1bbbf367`. Against `a8a66d260`:
`apps/studio/e2e/personal-any-hour.spec.ts` (new), `apps/studio/fixtures/personal.tsx`,
`docs/plans/ci-personal-fixture-clock.md`, this record.

## Outcome

- **Given no `at=HH:MM`, the personal fixture's clock stands at noon today** (it stood at the browser's). Every check
  that loads `personal.html`, now and later, sees yesterday's and today's talk and the day's light whenever CI runs it.
  `at=HH:MM` still sets the hour. Nothing the person sees changes.
- **A new check guards it** (`e2e/personal-any-hour.spec.ts`): the page's clock fixed by `page.clock` just after
  midnight, at a quarter past, at half past, a minute before midnight and as a year begins; the talk loaded with no
  hour shows «Yesterday · Where you began» and «Today» in the day's light.
- **No check on main fails at the risky minutes today.** The ones that needed «Today» are those #438 and #473 pinned;
  the rest happen not to look at the days. The default closes the family for the next check that does.
- **Why the default is safe, which #473 doubted:** on this page the product's own reads of the real clock say a day
  (`Memory` and `NotesPanel` labels) or reach nothing visible (`welcomeDue` asks the fixture's `resume`, a receipt).
  Noon of the real day gives them the same day; no «how long ago» on the page moves.
- **`chat-times` is not exposed:** the room's two days are calendar days (`room.tsx` `overTwoDays`), a future time
  reads as today (`dayLabel`, `past`). **Home was** (this line first said otherwise): see «After the independent
  review».

## Evidence

- Lever (local, never committed): an inline script in `personal.html`, `room.html` and `home.html` that starts the
  browser's whole `Date` at a set local time, ticking from each page load, so the fixture and the product read it alike
  (as a CI run at that hour would). Probe at 00:03: «Sunday · Where you began», «Yesterday», `data-hour` `night`.
  Scripts in the session's `scratchpad/clock/` (`lever.sh`, `drive.sh`, `waitrun.ps1`).
- Sweep before the fix (`clock/red-summary.txt`, logs `pw-logs/clk-red-*`): at 00:00, 00:03, 00:06, 00:10, 00:13,
  00:30, 23:59 and 2027-01-01 00:03, `personal.spec` (102), the other personal specs with `message-links`, `chat-times`,
  `home-needs`, `control-heights` and `menu-scale` (81), and the Personal rows of the specs that sweep many pages
  (`--grep "personal|Personal|companion|spaces"`, 39), desktop and phone: 222/222 at each minute but 23:59, where
  `personal.spec:872` («at night the field asks “Still up?”», pinned `at=23:30`) found no field once. Run again at 23:59
  with its light neighbour `--repeat-each 10`: 20/20 (`clk-2359-stillup-x10`); a probe there found the field. The
  machine, not the clock. `ink.spec` whole at 00:10: 25 passed, 1 skipped (`clk-0010-ink`).
- Red, the new check at `7cefaa1b1` (`pw-logs/clk-anyhour-red2.txt`): 5 of 5. 00:03: «Received "Sunday · Where you
  began", "Yesterday"» for «"Yesterday · Where you began", "Today"»; 00:13: the same days and «Yesterday»; 00:30:
  «"Sunday · Where you began"»; 23:59: «Expected: "day" Received: "night"»; 2027-01-01 00:03: «"Wednesday · Where you
  began", "Yesterday"». (The first run, `clk-anyhour-red`, failed the year's case on a fixture server another run shut;
  the other four the same.)
- Green at `d1bbbf367`: the new check `--repeat-each 3`, 15/15 (`clk-anyhour-green`); the sweep again with the new
  check added, 227/227 at each of the eight minutes and once without the lever (`clock/green-summary.txt`,
  `pw-logs/clk-green-*`; 00:06's `personal.spec` chunk run again after the guard stopped it eight times for a heavy
  app, 102/102).
- Whole-repo `oxlint --type-aware` (exit 0), `tsc --noEmit -p apps/studio` (exit 0), Prettier on the two files: clean.
  No unit file touched.

## Decisions and changes

- **The fixture's default, not more pins.** Pinning the rest would mean editing about 160 addresses (by a rough count) and leave the
  next check exposed; the default covers every check and the demo rows. The `at=12:00` pins stay: they say what their
  checks need.
- **Noon of the real day, not a fixed date:** the product's day-granular real-clock reads stay on the same day, and the
  notes' year label stays as before.
- **`page.clock` for the guard, as `menu-scale` does:** it moves the whole page's clock, fixture and product alike.
- **One test-first pair:** the check (`7cefaa1b1`, failing), then the default (`d1bbbf367`).

## Remaining obligations

- Her night, morning and evening light are now measured only by the checks that ask by hour (`personal.spec`'s
  «moments»); the contrast and ink checks measure the day's. Before, they measured whichever light CI's hour gave. A
  night-light contrast row would be new coverage, outside this change.
- A page that lives across midnight still meets it (the fixture's day stays, the real clock moves on): seconds a day.
- CI is the run on record.

## After the independent review

- No P1 or P2. Its three P3s, each a test-first pair: `b41339e26`/`0fbf7489a` (an hour that is not one stands at noon),
  `087a0b7fe`/`26b399689` (what is said during a run is stamped by the fixture's clock), `7e411b312`/`12bde851e` (Home's
  fixture stands at noon of the real day, guarded by `e2e/home-any-hour.spec.ts`).
- Red: `pw-logs/clk-p3-red.txt` (the any-hour checks for Home at five to midnight, half past midnight and as a year
  begins, and the hour that is not one) and `pw-logs/clk-home-red.txt` («Received "ContinueSunday · The launch
  pressure…"», «Good evening» for «Good afternoon»).
- The session that wrote them ended before its own green run finished (`clk-p3-off-h1` stops at 118/183); the
  coordinator ran the green on the batch branch `group/follow-ups-9` instead (any-hour, personal, Home and their
  neighbours) and recorded it in the batch PR.

## Next bounded action

- Luis: say whether this joins the next batch. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository only.
