# Every press answers

> 2026-10-10 · Luis: «sigue y encólalas, terminarlas todas». Informe-30 §2.3: «Tres estados definidos una vez: hover,
> pressed, focus … Objetivo: 100 % de los controles cambian al pasar». The last of §2. No API change.

## What was measured

- 116 hover rules in the sheets, one `:active` on the kit's presses (the pill's half pixel), the focus ring from #208.
- Matched against the presses on screen (a rule whose selector reaches the press or a parent), six pages had every
  press covered but one kind: the **text press** (`.text-button`, the kit's `kind="text"`) has no hover and no
  pressed state at all. On Conversations three of them stood mute: «Earlier messages», «and 2 more», «Decline».
  The informe's other names (Home's rows, the Knowledge cards, «This project / All projects», the list of
  Conversations, «Send», «Account») answer today, by their own rules or by the kit's (Segmented, Card).
- A rule that reaches a press is not yet an answer a person sees: the check must hover with a pointer and read what
  changed.

## What changes

- **The text press answers** (`theme.css`): under the pointer its underline wakes from a third of its ink to the ink
  (`text-decoration-color`, 140 ms); pressed, it sinks half a pixel, as the pill does. The ghost and the square
  (`.ghost`, `.round`) sink half a pixel pressed too: the kit's four kinds share the one pressed state (the informe's
  «fondo un paso más» is each kind's own hover plane, which stays while pressed).
- `e2e/press-answers.spec.ts`: on the thirteen fixture pages, every press a person can see (a button, a link, a
  button, tab or menu item role, not disabled, on screen) is hovered with the pointer and must change: its own ink,
  plane, edge, shadow, opacity, transform, underline, outline or filter, or a child's. And pressed, one press of each
  of the kit's four kinds reads `translateY(0.5px)`.

## States

- Hover and pressed per kind, once: the pill (plane 0.04 → 0.08, edge `--line-3`; sinks), the ghost (ink and plane
  0.06; sinks), the square (ink, edge `--line-2`, plane 0.06; sinks), the text press (the underline wakes; sinks). Focus
  unchanged (the ring).
- Touch (`hover: none`) is unchanged: the pressed state is the one a finger sees.

## Checks (written first)

- The spec's measure before the change on Conversations: three text presses do not change under the pointer; pressed,
  a text press reads `none`. With the change: none mute, the four kinds sink.
- Mutant, with the control passing: the text press's hover rule removed, Conversations reports its three; the pill's
  `:active` removed, the pressed check reads `none`.
- `pnpm check` clean.

## Left

- The spec hovers each press in turn (a quarter second each): the thirteen pages take about a minute in CI, marked
  slow. A press that opens something on hover (none today) would need its own handling.
- Informe-30 §2 is in: the kit (§2.1), the type scale's leadings and weights (§2.2), the answers (§2.3). §2.4
  (widths) and §2.5 (a light mode) are layout and palette work, outside the kit.
