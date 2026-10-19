# Implementation-session handoff

Goal and attempt: TOAST-PHONE-WIDTH (found while building seam #1, #466: `call-ends-on-open.md`, Limits), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `ui/toast-phone-width` from `origin/main`
(`e395d63ea`, which holds #466)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no kit change.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` and `.claude-guards/safe-run.ps1`, two
workers); CI as the run on record.
Existing authority: Luis 2026-10-18, «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si
se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando»; merges on green
with no open P1. One CSS property, to join the next group PR.
Ending commit/tree: `aa3efd9a7ca0` (tree `52608dd0366c`), the branch's last commit that changes code (later commits
touch only this record). Against `origin/main` at that commit: `e2e/app-auth.spec.ts`, `e2e/toast-over-sheet.spec.ts`,
`src/app/theme.css`, and the plan note `docs/plans/toast-phone-width.md`.

## Outcome

- On a phone the toast is as wide as its line, up to the gutters, and still centred. At 390 px #466's «Your call in
  “Fixture project” ended when you opened “Research notes”.» with Rejoin spans 358 px on 2 lines. Before, it was
  195 px wide on 4 lines. With a sheet open the toast sits at the top, and does the same there.
- On a computer a toast that fits half the screen is unchanged: same width, place and paint. At 1280 × 800 that is
  every toast today. A longer line in a narrow window (#466's at 900 px) now stays on one line, 496 px wide, where it
  took two at 450 px.
- At 320 px the line takes 3 lines; before, it took 7. The brief asked for 2. See Decisions.

## Evidence

- Plan: `docs/plans/toast-phone-width.md` (`f3a880b11`).
- **Measured first** on `main` (`e395d63ea`), with a throwaway spec on the app's page (`work=lost&projects=two`),
  deleted after:
  - #466's line: 195 × 100 px at 390 × 844, 160 × 160 px at 320 × 640, and 450 × 60 px at 900 × 800. At 1280 × 800 it
    is 495.6 × 44 px at x 392.18, centred on 640, its foot at 718.
  - «You left Fixture project.»: 165.7 × 40 px at 1280, centred on 640, its foot at 718.
  - The words' widths at 13 px: «Your call in “Fixture project” ended» is 202.2 px, «when you opened “Research
    notes”.» is 211.4 px. At 320 px the words get 209.1 px beside Rejoin.
- **Written first** (`1faee273e`), run through the guard with `-Detach` (`pw-logs/toastw-red.txt`, grep `toast`):
  4 failed, 7 passed. Each failure is on the lines the words take:
  - at 390 × 844: «Expected: <= 2 / Received: 4»;
  - at 360 × 740: «Expected: <= 2 / Received: 6»;
  - at 320 × 640: «Expected: <= 3 / Received: 7»;
  - with a sheet open at 390 px (`toast-over-sheet.spec.ts`): «Expected: <= 2 / Received: 4».

  The 1280 × 800 control passed, and so did the six over-sheet checks already there.
- **Fixed** (`aa3efd9a7`): `.toast` gets `width: max-content`. Its `left: 50%`, its translate and every rule over a
  sheet are unchanged.
- **At the fix**, through the guard (`pw-logs/toastw-green.txt`): 100 passed across `app-auth`, `toast-over-sheet`,
  `signed-in-later`, `new-version`, `light-mode`, `skip-link`, `personal-forget-note`, `personal-notes-write`,
  `light-elevation` and `light-surfaces`.
- Studio units: 1833/1835. The two failures are the Windows path ones (`attention.test.ts`,
  `browser-imports.test.ts`). The `src/app` units that read the sheets, including `elevation.test.ts`, which pins the
  toast's shadow: 283/284, the one failure being `attention.test.ts`.
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio` and Prettier on the three touched code files: clean.
- **Captures** in the session scratchpad, `ui-toast-phone-width/`, before (`main`) and after, on the app's page:
  | Capture | Before | After |
  | --- | --- | --- |
  | `toast-1280x800-dark-*.png` | 495.64 × 44 at x 392.18 | 495.64 × 44 at x 392.18 |
  | `toast-390x844-light-*.png` | 195 × 100, 4 lines | 358 × 60 at x 16, 2 lines |
  | `toast-320x640-light-*.png` | 160 × 160, 7 lines | 288 × 80 at x 16, 3 lines |

  Horizontal overflow is 0 in all six. At 1280 the toast's inside is pixel-identical before and after. The 29 pixels
  that differ lie on its outer columns and corners, antialiased over the room's light, which moves, and at the tip of
  its 8-second line, which stopped at a different moment in each run.

## Decisions and changes

- **`width: max-content`, not `.new-version`'s `inset-inline: 0` with `margin-inline: auto`.** The toast's rise and its
  three rules over a sheet are written with `left` and the translate. Keeping them leaves the computer's toast
  identical: same `left`, same transform. The rule between 561 and 790 px sets its own width, which still wins.
- **No sideways scroll.** A fixed box adds nothing to the page's width: the overflow is 0 in every check and capture.
  On the room's fixture at 390 px, emulated as a touch phone, with the same rule injected, the page's zoom stays
  at 1.
- **Brief against measurement, 320 px.** The brief asks for at most 2 lines at 320 × 640. Sizing alone leaves the
  words 209.1 px. The sentence's second half needs 211.4 px, so there are 3 lines, by 2.3 px. The 320 check pins what
  sizing promises: the full width the gutters leave (288 px), centred, no sideways scroll, and 3 lines at most. The
  360 px row, the smallest common Android width, holds 2 lines. Two lines at 320 would need a change of look on a
  phone: a gap of 8 px instead of 12 (213.1 px), or padding of 12 px and a gap of 8 (217.1 px). That rides on one
  fixture's titles, so it is left to Luis.
- **The desktop control pins shape, not font metrics.** Each toast's width is checked against the width of its own
  words on one line (within 0.5 px), with its height, its centre and its foot. CI's Linux could round text widths
  differently from Windows, so the literal widths measured on `main` are in a comment, not in an assertion.
- The over-sheet spec's notice now draws its words in a `span`, as `Toast.tsx` does, and can carry a press.

## Remaining obligations

- At 320 px #466's line keeps 3 lines (see above): Luis's call on the phone's gap or padding.

## Next bounded action

- Luis: say when to push (with the next group PR); then merge on green with no open P1. Nothing is owed locally.
- Source IDs consulted: none from the source register. The work read this repository and the intro of
  `evaluacion-2026-10-18/experiencia/costuras.md`.
