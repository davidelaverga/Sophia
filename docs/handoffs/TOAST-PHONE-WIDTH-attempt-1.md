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
Ending commit/tree: `23d18e7c1abe` (tree `d468e9e3cfcf`), the branch's last commit that changes code, after review
round 1 (later commits touch only the plan note and this record). Against `origin/main` at that commit:
`e2e/app-auth.spec.ts`, `e2e/toast-over-sheet.spec.ts`, `src/app/theme.css`, and the plan note
`docs/plans/toast-phone-width.md`. Round 1 began at `1b702896d`.

## Outcome

- On a phone the toast is as wide as its line, up to the gutters, and still centred. At 390 px #466's «Your call in
  “Fixture project” ended when you opened “Research notes”.» with Rejoin spans 358 px on 2 lines. Before, it was
  195 px wide on 4 lines. With a sheet open the toast sits at the top, and does the same there.
- On a computer the toast is unchanged, whatever its line: same width, place, lines and paint at 1120 px and wider,
  and over a sheet at any width above a phone's. A line longer than half the screen still wraps in that half (640 px
  at 1280). Between 561 and 1119 px, with no sheet, a long line reads in 560 px where it had half: #466's at 900 px
  now stays on one line, 496 px wide, where it took two at 450 px. (Round 0 let a long line stretch across a
  computer's screen; see Post-review, round 1.)
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

## Post-review, round 1 (independent reviewers: one P2, real)

- **On a computer a line wider than half the screen stretched without a limit, untested, and the record claimed what
  it hadn't measured.** Real. `width: max-content` lifted the half-width cap everywhere, not only on a phone. «Every
  toast today» held only for the fixture's titles: a project's title may take 180 characters
  (`db/migrations/0001_core.sql`), and `callEnded` and `carried` (`notice-view.ts`) put titles in the line. Measured
  first with a throwaway spec on the room's fixture (#466's line with two titles of 80 characters, and Rejoin), on
  `main`, at round 0's head and later at the fix: at 1280 × 800 the toast was 640 px on `main` and 1203.2 px at round
  0; at 1920 × 1080, 960 and 1270.8; at 1920 with the Invite sheet open, 1170 and 1270.8 (the plan note has the
  table).
- **Written first** (`a172e51f5`, `toast-over-sheet.spec.ts`), run through the guard with `-Detach`
  (`pw-logs/toastw-r2-red.txt`): 4 failed, 7 passed. Each failure is on the toast's width:
  - at 1280 × 800: «Expected: 640 / Received: 1203.1875»;
  - at 1920 × 1080: «Expected: 960 / Received: 1270.78125»;
  - at 900 × 800: «Expected: 560 / Received: 846»;
  - at 1920 × 1080 with the sheet open: «Expected: 1170 / Received: 1270.78125».

  The spec's earlier checks, round 0's phone check among them, passed. That check now reads its frame through the
  same helper as the new ones.
- **Fixed** (`23d18e7c1`): `.toast` takes `max-width: min(calc(100% - 2 * var(--gutter)), max(50%, 560px))`: on a
  computer the half `left: 50%` always gave it, a reading width; never less than 560 px, about 80 characters of 13 px
  beside a press; never past the gutters. Over an open sheet on a computer,
  `min(calc(100% - 420px - 2 * var(--gutter)), calc((100% + 420px) / 2))`, the room from its centre to the screen's
  edge, which is what `left` gave it there. The two narrower rules over a sheet are unchanged.
- **Measured at the fix**, the same 28 cases (390 to 1920 px, with and without a sheet, this line and a shorter one):
  every case at 1120 px and wider, and every one with a sheet open above a phone's width, equals `main` to the
  hundredth in width, lines and centre. What moves is a phone (≤ 560 px) and, with no sheet, 561 to 1119 px, where a
  long line reads in 560 px instead of half the screen.
- **At the fix**, through the guard (`pw-logs/toastw-r2-green.txt`): 104/104 pass across `app-auth`,
  `toast-over-sheet`, `signed-in-later`, `new-version`, `light-mode`, `skip-link`, `personal-forget-note`,
  `personal-notes-write`, `light-elevation` and `light-surfaces`. Studio units: 1833/1835, the two failures the Windows
  path ones. `src/app/*.test.ts`, which read the sheets (`elevation.test.ts` pins the toast's shadow): 283/284, the
  failure `attention.test.ts`. Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio` and Prettier on
  `theme.css`, `toast-over-sheet.spec.ts` and `app-auth.spec.ts`: clean.
- **Captures** in the session scratchpad, `ui-toast-phone-width/`, the long line on the room's fixture at round 0's
  head (`1b702896d`) and at the fix (`23d18e7c1`):
  | Capture | Round 0 | Fix |
  | --- | --- | --- |
  | `toast-long-1280x800-dark-*.png` | 1203.19 × 60 at x 38.41, 2 lines | 640 × 80 at x 320, 3 lines |
  | `toast-long-390x844-light-*.png` | 358 × 120 at x 16, 5 lines | 358 × 120 at x 16, 5 lines |

  Horizontal overflow is 0 in all four.
- **Left as it is:** at 1920 px a long line still reads in 960 px, about 150 characters, as it did on `main`. A
  narrower reading width on wide screens would change a computer's toast, which the brief keeps as it is.

## Remaining obligations

- At 320 px #466's line keeps 3 lines (see above): Luis's call on the phone's gap or padding.

## Next bounded action

- Luis: say when to push (with the next group PR); then merge on green with no open P1. Nothing is owed locally.
- Source IDs consulted: none from the source register. The work read this repository and the intro of
  `evaluacion-2026-10-18/experiencia/costuras.md`.
