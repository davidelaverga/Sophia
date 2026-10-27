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

## The spec's two other timed waits (coordinator's follow-up, same day)

Neither has failed in the logs read; both read a moment instead of an outcome.

- **«focus moved to another decision during the write stays there»** read `toBeFocused(other)` as soon as the line
  showed, a frame before NextUp looks where the focus is. Measured with a control (never on the branch, `49880b647`:
  NextUp always takes the focus, the old check also under `slowFrames`): at the machine's own rate the old check fails
  10 of 10, but at CI's 8 frames a second it **passes 10 of 10**: on CI it could not tell. No DOM change marks the
  frame when NextUp leaves the focus alone, and a test-side frame tick cannot be ordered against NextUp's (its effect
  may register its frame after the test's), so **the line says it** (`NextUp.tsx`: `data-settled` once its frame has
  run, removed when its words change; nothing seen changes; one ref for both kinds of line). The check waits for it,
  then reads the focus.
- **«answering the one it names, the line goes while the answer is on its way»** read `toHaveCount(0, { timeout: 250 })`
  against a write recorded after 300 ms: a window. The fixture can now hold an answer on its way
  (`fixtures/work-live.ts`: `decide=held`, the first recorded after 300 ms, each later one held until
  `workFixture.releaseDecision()`). The check waits for the second answer to be sent (`answered` has 2), checks the line
  gone while it is held, releases it, and sees the line again with what comes next.

### Checks

- `test: … (failing)` for the first: red because no line says `data-settled` («unexpected value "null"»); green with
  the marker.
- Controls, never on the branch: NextUp always taking the focus (`64adceb12`) fails the new check 20 of 20, at the
  machine's rate and at 8 frames a second (`toBeFocused`, «Received: inactive»); the line kept while the answer goes
  (`7ab8703fa`, `setShown(false)` removed) fails the held check 10 of 10 (`toHaveCount`, «Expected: 0 Received: 1»).
- Green: the spec `--repeat-each 20`, 160 passed; `palette-knows` and `work`, 214 passed.

## Limits

- The marker is a test hook in product code, kept to one attribute; it says nothing a person reads.
