# Next up's Enter waits for the focus, however slowly CI draws

> 2026-10-26 · One of the week's three room flakes: `[desktop] › e2e/next-up.spec.ts:29:1 › next up · it names the task
> that waits for the viewer, and Enter opens its sheet`, 2 failures from 2026-10-19 to 2026-10-26, the last on
> 2026-10-25T11:27:35Z (`scripts/reliability-report.mjs --ci`). Davide's lane wrote the spec; Luis 2026-10-26: «Procede
> con el lote de los tres flakes», earlier «arregla tú los de Davide» and «Lo que no se mide, no se puede mejorar».
> Tests only; nothing the person sees changes.

## Measured

- **Both failures are the same line.** The failed `ci.yml` runs of the week, each failed job's log read: run
  39328633002 (2026-10-19, `main` at `5b12ce1b`) and run 40188885090 (2026-10-25, `2cc79d39`), both «The room in
  Chromium, part 2 of 3», both `next-up.spec.ts:37:23` at the time, 8.4 s:
  `expect(locator).toBeVisible() failed … getByRole('dialog') … Expected: visible … element(s) not found`, right after
  `page.keyboard.press('Enter')`. The words check before it passed; no other test of the spec failed. The other 11
  failed runs read had no next-up failure.
- **The cause, in the code:** `NextUp` renders the line's words at once and gives its press the focus one animation
  frame later (`requestAnimationFrame` in `NextUp.tsx`). The test pressed Enter once the words showed. CI's room
  runners draw about 8 frames a second (`e2e/frames.ts`, from #462), so the frame can come after Playwright's three
  reads (words, `textContent`, Enter); the Enter then lands where the answer left the focus, and opens nothing.
- **Already fixed on main, by Davide's lane:** `63430578b` (2026-10-25 12:56Z, after the last failure; on main through
  #482) waits `toBeFocused()` on the press before Enter. Its message says the CI focus is unknown (no trace).
  Since then the test passed in every room run read (40196169238, 40320260093). No proof of the wait under CI's frame
  rate was kept.
- **Proved here with the slow-frames lever** (`slowFrames`, every frame 125 ms late): with the wait removed (a control
  commit, never on the branch), the slow case fails 10 of 10 with CI's exact error while the case at the machine's own
  rate passes 10 of 10; a probe read `document.activeElement` at the Enter: `BODY` in 3 of 3 slow runs,
  `BUTTON.text-button` (the press) in 3 of 3 at the machine's rate. So the Enter went to the page's body, as the fix
  assumed.

## What changes

- **The steps move into a helper** (`opensTheNamedTask`), the test at `:29` keeps its title and its every check.
- **A slow-frames case**, the same steps with `slowFrames` from the page's first script: the wait is guarded where CI is
  slow, and dropping it fails every time instead of twice a week.

No product change: the focus a frame after the words is NextUp's design (it must wait for the disabled choice to drop
the focus, `docs/plans/next-up.md`), and the test now waits for exactly that condition.

## Checks

- Red, control mutant (`98e81ccf8`, the focus wait removed): slow case 10/10 failed, `getByRole('dialog')` not found.
- Green: the whole spec `--repeat-each 20` through the guard, slow case included; neighbours `palette-knows`, `work`.

## Limits

- Two other waits in this spec look time-dependent from the code, neither has failed in the logs read: «focus moved to
  another decision during the write stays there» checks `toBeFocused(other)` as soon as the line shows, which can pass
  before NextUp's frame has had its chance to move the focus (a vacuous pass, not a flake); «answering the one it
  names» waits `toHaveCount(0, { timeout: 250 })`, a fixed window on a slow runner. Left as they are; noted.
