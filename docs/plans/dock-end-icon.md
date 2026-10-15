# The phone dock's «End»: Sophia's light going out, not a stop square

> 2026-10-13 · Luis: «Sí, cambia el icono de End», after `informe-sala-20.md` finding 2. The phone's dock stays icons
> only (docs/plans/phone-dock.md, Luis 2026-10-07); only End's icon changes.

## What was measured

- On a phone, Sophia's «End» (she leaves the conversation; her work carries on) is the kit's `stop` icon: a filled
  square. It sits beside «Leave the room», and a touch screen shows no tips: a square next to an exit reads as hanging
  up, or stopping a recording.
- «Speak with Sophia» on the same dock is her light (`sophia`: a point that shines).

## What changes

- **End's icon is `sophiaOff`**: her light (as on «Speak with Sophia») struck through, as the dock already strikes
  the camera and the speaker when they are off. A first try, her point with the exit's arrow, read like «Pass to…» (a
  ring with an arrow) one square away, so it was dropped. Its diagonal rays are left out: under a slash they read as one more ray, so only the four straight ones stay and the stroke reads clean. Its name, tip and press are unchanged; a computer still shows the word «End».

## Checks

- `e2e/room-dock.spec.ts`: on a phone with Sophia in the conversation, End's icon is drawn from her light (a filled
  point), struck through, and differs from Leave's and Pass's.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; the dock specs
  through the guard.
