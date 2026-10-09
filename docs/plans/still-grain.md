# The grain stays still

> 2026-10-09 · Luis: «sigue evaluando e iterando», after the «$20» evaluation. Found measuring every fixture page: the
> one animation running on all of them is the film grain (`body::after`, `grain 0.9s steps(6) infinite`). No API change.

## What is wrong

- The grain is a layer twice the screen's size, moved six times every 0.9 s, on every page, for as long as the page is
  open. At 3 % opacity its movement is barely seen, but it repaints the whole screen several times a second: the one
  thing that never rests in a Studio whose rule is that motion is for events (Luis, 2026-09-30: continuous motion at
  the edge of the room «distrae»).

## What changes

- The grain stays: the same texture, at the same 3 %, over the screen, held still. The layer covers the screen and
  no more; the keyframes go.
- Reduced motion already stopped it; that rule loses nothing.

## Checks (written first)

- `still-grain.spec.ts`, on the sign-in, home and the room: the grain is there (its texture and opacity), it has no
  animation, and no animation runs for ever on the page's body.
