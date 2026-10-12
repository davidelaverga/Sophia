# Conversations, polished: one left edge for the list, faces that read on paper

Luis asked to keep polishing (2026-10-12), looking at Conversations. Measured on `room.html?demo=1&conversations=1`
at 1280 × 800, both themes, headless Chromium (`evaluacion-2026-10-12/conv-*-1280.png`, `conv-measures.json`).

## What was measured

- **The list's column has four left edges.** The title «Conversations» starts at 18 px (the pane's 10 + the head's
  8), the filter's box at 10, «Open» and «Mine» at 22 (the pane's 10, the group's 2, the ghost's 10), a row's box at
  8 (the rows' −10 margin and 8 padding) and a row's title at 20. The eye reads a ragged margin where there should be
  one line of words and one line of boxes. The «+» press ends at 284 while a row's date ends at 280.
- **The faces in the open conversation's head do not read on paper.** `.conv-face` is a fixed `#1a1714` disc with
  the warm ink and a ring in `--void`: in the room a dark disc with a pale initial; on paper a dark disc with a
  dark-warm initial (`--warm` is `#965328` there) and a ring in the paper's void. Measured: the initial's contrast on
  its disc under 1.5:1 in light.

- **Two trackings for one head.** The list's title («Conversations», 15/600) inherited the view titles' −0.02 em from
  the generic `h2`; the open conversation's title and the kit's other 15 px heads (a goal's, a card's) sit at
  −0.015 em. Measured: −0.3 px against −0.225 px.

## What changes

- **One line of words at 20, one line of boxes at 8**, as the rows already have them: the pane's inline padding 8
  (was 10), the head's padding 12 (title at 20, the «+» press ending at 280 with the dates), the filter's box at 8,
  «Open»/«Mine» with a 2 px lead (words at 20), the rows' margin −8. Nothing moves vertically.
- **The list's title takes the 15 px heads' tracking** (−0.015 em), as the open conversation's does.
- **Faces on paper take a warm tint** (the warm channels at 32 %, 1.6:1 on paper: the own bubble's 8.5 % would vanish
  under a 10.5 px initial) with the warm ink, ringed in the head's plane; Sophia's a core tint; the room keeps its dark disc
  and pale initial.

## Checks (written first)

- `e2e/conversations-column.spec.ts` (`conversations-polish.spec.ts` is #158's): at 1280 the title's, the toggles' and a row title's left edges are one value;
  the filter's and a row's box edges are one value; the «+» press and a row's date end on one value. In light the
  face's initial reads at 3:1 or more on its disc (the face is a glyph in a circle: the kit's floor for a mark), and
  the disc on the head's plane at 1.5:1 or more (a shape, not words).
- `conversations-panes.spec`, `project-conversations.spec` and `light-mode.spec` unchanged and green.

## Left

- The context pane's eyebrows (12 px, 600, second ink) are one step below the list's 15 px head: a hierarchy question
  for Luis's eye, not a defect.
