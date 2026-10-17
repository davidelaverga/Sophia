# On paper a raised panel rises

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), X7, from Luis's «Sigue con la cola … y el nuevo
> informe-25». Split from X6 (links in the page's ink), which waits on Luis's brand answer. Studio only, CSS only.

## What was measured

- On paper `--plane` (#f4f0ea) is darker than `--void` (#fbf8f3), and the modal veil was the page's own colour at half.
  A sheet sat darker than the page it covered (about 1.07:1 the wrong way), and so did the report pane; the resource
  sheet's head light ended in that beige. The room keeps the right order (void < plane < plane-2).

## What changes

- **Tokens:** `--sheet-plane` (a raised panel) and `--veil` (what dims the page under a modal one). In the room they are
  today's plane and half the void; on paper white (`--plane-2`) and ink at 0.18.
- **Rules:** `.sheet` and `.sheet-top` stand on `--sheet-plane`; the backdrop is `--veil`; the report pane sets
  `--md-ground` to `--sheet-plane`, and its markdown tables' scroll covers and pinned cells take it (another ground keeps
  `--plane`); the resource sheet's head light ends in `--sheet-plane`.
- **Wells:** on paper the two borderless boxes a raised panel holds, a report's comparison and an update's text, sit a
  step down in `--plane`, or they would vanish on the white.

## Checks, written first

- `light-elevation.spec.ts`: on paper a sheet and its top are white under an ink veil at 0.18 and at least 1.4:1 lighter
  than the veiled page, an update's text a well on it; the report pane white and lighter than the page, its table's
  covers and pinned cells white, a comparison a well on it, and a table on another ground keeping its covers; the
  resource sheet's head light ending in white. In the room (the control) the sheet keeps #0b0a0f and the veil half the
  void.

## Left

- The Conversations context drawer under 1180 px and Personal's notes panel stand on `--plane` over the page the same
  way; their files are in open PRs (#385's window, #431, #420, #421). With the tokens each is a two-line follow-up.
- The veil's strength (0.18, the middle of the report's 0.16–0.22) is set on the captures; Luis can tune it.
