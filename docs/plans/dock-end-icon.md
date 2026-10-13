# The phone dock's «End»: Sophia's light going out, not a stop square

> 2026-10-13 · Luis: «Sí, cambia el icono de End», after `informe-sala-20.md` finding 2. The phone's dock stays icons
> only (docs/plans/phone-dock.md, Luis 2026-10-07); only End's icon changes.

## What was measured

- On a phone, Sophia's «End» (she leaves the conversation; her work carries on) is the kit's `stop` icon: a filled
  square. It sits beside «Leave the room», and a touch screen shows no tips: a square next to an exit reads as hanging
  up, or stopping a recording.
- «Speak with Sophia» on the same dock is her light (`sophia`: a point that shines).

## What changes

- **End's icon is `sophiaLeave`**: her light's point on the left and an arrow going out to the right. It says «she
  goes» in the dock's own vocabulary: her light (as in «Speak with Sophia») and the exit's arrow (as in «Leave the
  room»), which keeps its door. Its name, tip and press are unchanged; a computer still shows the word «End».

## Checks

- `e2e/room-dock.spec.ts`: on a phone with Sophia in the conversation, End's icon is drawn from her light (a filled
  point) and differs from Leave's.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; the dock specs
  through the guard.
