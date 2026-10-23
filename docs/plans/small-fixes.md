# Small fixes: the kit's checkbox, the destructive answer on hover, motion that moves

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), X8, M12 and M14, from Luis's «Sigue con la cola …
> y el nuevo informe-25». Studio only, CSS only.

## What was measured, and what changes

- **X8, checkboxes in the browser's blue** (#99c7fe on dark, #0075ff on paper: Settings' call defaults, From your
  projects, the carry package, Review sources). They now take `accent-color: var(--core)`, the kit's «on»: the fill of a
  pressed square and a primary press (near-white on dark, #5546b8 on paper). The two boxes that are Sophia's on purpose
  keep their violet (Revise with Sophia, `artifacts.css`; and Connections' update line, Davide's chapter 7).
- **M12, the destructive answer on hover:** the pill's own hover (0,3,0) outweighed `.pill.danger` (0,2,0), so under
  the pointer its fill turned to ink and its edge grey. Its own hover keeps the rose fill and wakes the edge (0.4 → 0.7).
  The fill stays 0.08 on purpose: on paper, deeper rose under rose words drops below 4.5:1 inside a rose zone.
- **M14, motion that did nothing:**
  - the room pill's live dot named `ps-dot-pulse`, whose keyframes 484e390ad renamed away. It is now still, by the
    house rule that motion is for events, not states;
  - the live ring transitioned `background` over a conic gradient, which only jumps. Its share is a registered number
    (`@property --fresh`) eased over the base duration, so a change sweeps and the ring rests long before the next tick.
    With less motion asked, it changes at once.

## Checks, written first

- `css-motion.test.ts`: every animation names keyframes a sheet declares; a transition reaches a gradient only through
  a registered property; `--fresh` is a registered number eased within a tick.
- `account-settings.spec.ts`: in both themes, a checked box's accent is the kit's «on» and no pixel of it is the
  scheme's default blue; «Sign out everywhere» keeps its rose fill under the pointer, its edge waking, its words 4.5:1.
- `resources.spec.ts`: a change of the ring's share runs one `--fresh` transition of 220 ms and the share is still
  above half right after; with less motion asked, none.
- `work.spec.ts` `settled()` and `press-answers.spec.ts` skip a registered property's eased value (it is no arrival or
  press), and never fail on a cancelled one.

## Decisions for Luis

- X8: `--core` (the kit's «on») against the report's `--halo-text` (lavender on dark). On paper both are #5546b8 until
  X6 separates Sophia's violet.
- M14: the dot still, or its pulse restored (the report's wording). Restoring is one keyframe and one reduced-motion
  line.
