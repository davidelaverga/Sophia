# On a phone the toast takes the width its gutters leave

> 2026-10-19 · found while building seam #1 (#466, `call-ends-on-open.md`, Limits) · Luis 2026-10-18: «Todo trabajo
> nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que
> alivie la presión pero hay que seguir trabajando». Studio only; joins the next group PR.

## Measured (main `e395d63ea`, the app's page, `work=lost&projects=two`)

- **Why it is narrow:** `.toast` (`app/theme.css`) sits at `left: 50%` and is pulled back by `translate(-50%)`. As a
  box that shrinks to fit, it fits the half of the screen right of its left edge, so its
  `max-width: calc(100% - 2 * var(--gutter))` is never reached.
- **#466's line** («Your call in “Fixture project” ended when you opened “Research notes”.» and Rejoin):
  - at 390 × 844 the toast is 195 px wide, and its words take 4 lines;
  - at 320 × 640 it is 160 px wide, with 7 lines;
  - at 900 × 800, a computer, it is 450 px, with 2 lines;
  - at 1280 × 800 it is 495.6 × 44 px, one line, centred on 640, its foot at 718 (`--floor` 18 + 64 above the bottom).
- **A short line** («You left Fixture project.») at 1280 × 800 is 165.7 × 40 px, centred on 640, its foot at 718. On
  one line the box is as wide as its words, plus 28 px of padding and 2 px of border.
- **Over a sheet:** the phone's rule (≤ 560 px, the toast at the top) keeps `left: 50%`, so it has the same half width:
  195 px and 4 lines at 390. The rule between 561 and 790 px gives the toast a width of its own (320 px), and the
  computer's rule centres it in what the panel leaves. Neither reaches the half-width limit for today's lines.
- **Brief against measurement:** the brief asks for at most two lines at 320 px too. At 320 the gutters leave 288 px,
  so the words get 209.1 px beside Rejoin. The sentence's second half («when you opened “Research notes”.») needs
  211.4 px. So at 320 the line takes 3 lines, by 2.3 px; at 360 and 390 it takes 2. Only less padding or a smaller gap
  on a phone would win that line back: a change of look, not of sizing, so it is left to Luis (Limits).

## What changes

- **`.toast` takes `width: max-content`:** the toast is as wide as its line, up to its `max-width`, wherever it
  stands. `left: 50%` and the `translate(-50%)` stay, so it stays centred, and every rule that moves it (over a sheet,
  its rise of 8 px) is untouched. The rule between 561 and 790 px sets a width of its own, which still wins.
- **Its `max-width` keeps the half on a computer** (after the review, below):
  `min(calc(100% - 2 * var(--gutter)), max(50%, 560px))`. Half the screen, as `left: 50%` always gave it, a reading
  width; never less than 560 px (about 80 characters of 13 px beside a press); never past the gutters. Over an open
  sheet on a computer, `min(calc(100% - 420px - 2 * var(--gutter)), calc((100% + 420px) / 2))`: no wider than what
  the panel leaves, nor than the room from its centre to the screen's edge, which is what `left` gave it there.
- **On a phone** (390 px) #466's line spans 358 px, inside the 16 px gutters, on 2 lines; with a sheet open, the same
  at the top.
- **On a computer** (1120 px and wider, and over a sheet at any width above a phone's) nothing a person sees moves,
  whatever the line: same left, same transform, same width, same lines, same paint. A line longer than half the screen
  still wraps in that half: 640 px at 1280, 960 at 1920, and 1170 at 1920 with a sheet open. Between 561 and 1119 px,
  with no sheet, a long line reads in 560 px where it had half: #466's line at 900 px keeps one line, 496 px wide,
  where it took two at 450 px.
- The page does not scroll sideways: a fixed box adds nothing to the page's width, and the translate keeps it inside
  the gutters.
- `.new-version` already solved the same case another way (`inset-inline: 0`, `width: fit-content`,
  `margin-inline: auto`). The toast keeps its `left` and `translate` because its rules over a sheet and its rise are
  written with them.

## Checks (written first)

- **Browser** (`e2e/app-auth.spec.ts`, the real `SignedIn` toast with #466's line):
  - at 390 × 844, 360 × 740 and 320 × 640, once its rise has ended, the toast is as wide as the screen less two
    gutters (within 0.5 px), inside them, centred within 1 px, with no sideways scroll. Its words take at most 2 lines
    (3 at 320, see above).
  - Control at 1280 × 800: #466's line and «You left Fixture project.» each keep one line, the width of their words on
    one line (within 0.5 px), centred on 640 within 1 px, their foot at 718.
- **Browser** (`e2e/toast-over-sheet.spec.ts`): at 390 px with the Invite sheet open, a notice with #466's words and a
  Rejoin spans the gutters on 2 lines, centred, clear of the sheet. The spec's notice now draws its words in a `span`,
  as `Toast.tsx` does.
- **Browser, after the review** (`e2e/toast-over-sheet.spec.ts`, the room's fixture): #466's line with two real-length
  titles reads in 640 px at 1280 × 800, 960 at 1920 × 1080 and 560 at 900 × 800, centred within 1 px; at 1920 with the
  Invite sheet open it is 1170 px, centred on 750, clear of the sheet. Each width is the viewport's geometry, not a
  font's, so a different text rounding on CI's Linux can't move it.
- **Paint:** the `app/*.test.ts` that read the sheets (`elevation`, which pins the toast's shadow, `surfaces`,
  `material`, `states`, `glow`, `css-motion` and the rest) stay green. The toast's colours, border and shadow are not
  touched.
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio`, Prettier on the touched files.

## Limits

- At 320 px #466's line keeps 3 lines (it had 7). Two lines there would need a phone-only padding of 12 px or a gap of
  8 px: Luis's call.
- The words themselves are #466's and stay as they are. A longer project title still wraps: on a phone in the
  screen's width, not half of it; on a computer in the half it always had.
- At 1920 px a long line still reads in 960 px, about 150 characters, as it did before this branch. A narrower reading
  width on wide screens would change a computer's toast, which this note leaves as it is.

## After the independent review (round 1: one P2, real)

- **A long line on a computer stretched across the screen.** `width: max-content` lifted the half-width cap
  everywhere, not only on a phone, and nothing checked a long line on a computer. «Every toast at 1280 px today» (this
  note) held only for the fixture's titles: a project's title may take 180 characters (`db/migrations/0001_core.sql`),
  and `callEnded` and `carried` (`notice-view.ts`) put titles in the line.
- **Measured** on the room's fixture with #466's line, two real-length titles (80 characters each) and Rejoin, the
  toast's width and the lines its words take:

  | Screen | `main` (`e395d63ea`) | Round 0 (`aa3efd9a7`) | Now |
  | --- | --- | --- | --- |
  | 390 × 844 | 195 px, 13 lines | 358, 5 | 358, 5 |
  | 900 × 800 | 450, 4 | 846, 2 | 560, 3 |
  | 1280 × 800 | 640, 3 | 1203.2, 2 | 640, 3 |
  | 1920 × 1080 | 960, 2 | 1270.8, 1 | 960, 2 |
  | 1440 × 900, sheet open | 930, 2 | 933.6, 2 | 930, 2 |
  | 1920 × 1080, sheet open | 1170, 2 | 1270.8, 1 | 1170, 2 |

  Across 28 cases (390 to 1920 px, with and without a sheet, this line and a shorter one), every case at 1120 px and
  wider, and every one with a sheet open above a phone's width, equals `main` to the hundredth: width, lines and
  centre.
- **The fix** is the `max-width` above, in `.toast` and in the rule over a sheet on a computer. The two narrower rules
  over a sheet (561 to 790 px, and a phone's) set their own widths and are unchanged.
