# The header and the dock: what they say, where their tips open, what gives way (Codex P2s on #253, #254, #259)

Luis, 2026-10-12: «atiende los P2 en PRs pequeñas». Eighth follow-up to the kit stack's open Codex P2s. This one: the
project header, its dock, and the controls at their edges.

## What was measured

- #253 4251423765: a goal's Stop, the last control at the content's edge, opens its tip centred: at common widths
  «End the work for good» runs past the gutter.
- #254 4249583233: a report open, focus on a header-dock control, resized from 721 to 720 px: the focus goes to the
  floating dock under the report, not the report's own call row.
- #254 4249583248, 4251437370: what the header's dock says (a media error, Sophia looking) hangs under the header over
  the report pane's title and actions, and over Conversations' context panel (721 to 1180 px).
- #254 4250204333: from 721 to 760 px the header has two rows; the dock's tips open over the views' row.
- #259 4249584173: at 1280 a long project title shrinks the nav below its 500 px and its fades come back.
- #259 4249584182: from 1241 to 1320 px «Copy project link» is folded to its icon; «Link copied» is inside the folded
  label, so a sighted person sees nothing change.

## What changes

- `ConfirmButton` takes `tipAlign`; the goal's Stop passes `end`.
- The dock's focus, back after a move, looks in the report's call row first, then the dock.
- The report pane and the context panel start under what the dock says (`--dock-notes-h`, which MiniDock keeps).
- From 721 to 760 px the dock's tips open under the views' row.
- From 901 px the project title gives way before the nav (`flex-shrink: 100`); the nav keeps its width.
- Folded, the copy press turns the teal of done for the two seconds «Link copied» is said (`data-copied`).

## Checks (written first)

- `widths.spec.ts`: at 1280 a long title leaves the nav whole (no fade); a viewer's folded copy press changes as the
  copy lands. `dock-header.spec.ts`: at 740 px the dock's tip opens under the views' row.

## Left

- The report-row focus and the two notes offsets are not browser-checked here (a header dock that says something over
  an open report needs a media error staged on a narrow window); they ride on `--dock-notes-h` as the lobby already
  does. Not run on this host: the machine guard refused Playwright (free RAM under 6 GB with AION2 open). CI is the run
  on record.
