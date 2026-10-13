# Home at first glance: the greeting's leading, the notes in the head, a join said at rest

> 2026-10-13 · Luis: «Sí, empieza con la PR 1», after `informe-espacios-20.md` (¿Vale $20? · Los dos espacios),
> findings 1–4.

## What was measured

- At 1440×900 (`home.html`, four projects) Home's scroller (`.c-home`) is 935 px in 852 seen: «All 4 projects» sits
  at y 891, half past the fold. The way into the work, the most used, is the last thing and half off screen.
- The greeting asks for `line-height: 1.02` (`.hw-hello`), but each of its two lines is a `span` of its own and the
  universal leading (`:where(*:not(.md, .md *))`, docs/plans/type-leading.md, the kit's #231) sets every element's
  leading on the 4 px grid: 1.55 × 52 → 80 px a line, 160 px for the greeting. A display line at 1.54 reads as two
  sentences, not one; a regression of the kit, not a choice.
- «3 notes» is a row of 54 px of its own under «Continue», with nothing but its count.
- A row that joins (a session live, or starting within 10 min) says «Join the room» only under a hovering pointer;
  at rest on a desk it shows «Standup starts in 10 min» and nothing to do about it. On a touch screen (`hover: none`)
  the words already show.

## What changes

- **The greeting keeps its own leading**: its lines inherit `.hw-hello`'s 1.02 (a rule that names a leading wins over
  the universal one). 160 → 106 px at 52 px; on a phone 38 px type, 112 → 78 px.
- **Your notes in the section's head**: «You and Sophia» on the left, «3 notes →» on the right as a text press, as
  Personal's head carries «Find · 1 note». The row goes; the list keeps «Continue».
- **A join said at rest, everywhere**: the touch rule (the words beside the arrow, the arrow shown) applies on every
  screen for a row whose press is not «Open». A row that opens keeps its arrow for the pointer.
- Together the left column is 935 → about 830 px: «All 4 projects» inside 852 at 1440×900.

## Checks

- `e2e/home-first-glance.spec.ts`: each greeting line's box at 1.02 of its size (desk and phone); at 1440×900 the
  last project row inside the scroller's view without scrolling; the notes press in the head, out of the list, and
  pressing it opens the notes; «Join the room» drawn at rest (pointer away) on a desk.
- `home.spec` «your notes open them» reads the press from the section, not the list.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`, the Home specs
  through the guard.
