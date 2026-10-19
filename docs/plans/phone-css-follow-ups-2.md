# Phone fits: follow-ups to #450, #460 and #425

> 2026-10-18 · three Codex P2s left on merged PRs, from the follow-up list. Studio CSS only; no API, no markup.

## What was measured

- **#450, «Your tile is hidden» at 320 px.** A fifth of the strip is 51.2 px (288 px less four 8 px gaps): 49.2 inside
  its edge. The eye (14), its gap (4) and Show (24) make 42 px, more than the 37.2 its 6 px padding leaves, so the tile
  overflows and the stack runs into its padding, centred about 3.6 px from the edge. By this arithmetic nothing visible
  is cut yet; Codex says the eye and Show are clipped, and the 320 px check measures it. The check at 390 px (65 px
  tiles) never saw it.
- **#460, «Sophia can’t answer here yet · Write a note» on a narrow phone.** In Geist the row is 286.7 px; at 320 px
  the column is 288. A scrollbar beside Home or a wider fallback font wraps it. Two rows were 20 + 4 + 24 = 48 px,
  past the line's 46 and the held place's 46, so Projects moved when the read resolved.
- **#425, the volume on touch.** The shared touch rule lifts a `.round` to 40 px tall only, and the row kept a 36 px
  column for the volume. It stayed 36 × 40. #459 since widened the menu's column to 40, not the volume's, so the
  finding still holds.

## What changes

- **`theme.css`, the phone strip:** the placeholder's padding is 3 px above and below (6 at the sides). 42 + 6 + 2 =
  50 px fits the 51.2 px tile; at 390 px the stack stays centred as before.
- **`personal.css`, the line's place:** the row gap is 2 px. Two rows are 20 + 2 + 24 = 46 px, the line's height; one
  row is unchanged.
- **`theme.css`, People on touch:** the volume's column is 40 px and its square `min-width: 40px`, as the menu's.
  The name's column gives the 4 px; a desktop keeps 36.

## Checks, written first (browser, run by the orchestrator)

- `room-tiles.spec.ts`: at 320 px, the eye and Show inside the tile's padding, no overflow, both whole in view, and
  Show still brings your tile back.
- `home-no-companion.spec.ts`: at 320 and 304 px (one row needs 319, so 304 stands for 320 with a scrollbar beside
  Home), the reason's slot is 46 px with its note inside. At 304 it takes two rows, and Projects stands where it does
  with the line and with the held place.
- `people-volume.spec.ts` (`@phone`): at 390 and 320 px, both volumes 40 × 40 or more, inside their rows, and the
  name still more than 40 px wide.

## Limits

- Where «Write a note» wraps, the «·» ends the first row. It did before, and that isn't the finding.
- `--lh-body` is in rem: with a larger browser text size, two rows pass 46 px again. Not changed here.
