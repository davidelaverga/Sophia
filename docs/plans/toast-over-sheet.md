# A notice never lies over an open sheet

> 2026-10-13 · Luis: «sigue con los puntos 2–5», after `informe-personal-real.md`, finding 5.

## What was measured

- On the real stack at 350 px, «Delete everything» in «Your data» says «Deleted. Sophia starts fresh.» in a toast that
  lies over the sheet's head («Your data» and its Close; capture `personal-real/06-borrado.jpg`). The toast is fixed
  at the screen's bottom centre (`.toast`, `bottom: calc(var(--floor) + 64px)`, z 60); on a phone (≤ 560 px) a sheet
  rises from the bottom (up to 90 dvh), so the two meet.
- On a wider screen a sheet is the right-hand panel, `min(420px, 100%)`: at 900 px the toast's centre (450) sits 30 px
  inside the panel (from 480).

## What changes

- **While a sheet is open the notice stands clear of it**: on a phone it shows at the screen's top, under the safe area
  (the sheet starts at 10 dvh at the highest); on a wider screen it is centred in what the panel leaves on the left,
  and never wider than that. With no sheet open nothing moves.

## Checks

- `e2e/toast-over-sheet.spec.ts`: with the Invite sheet open in the room's fixture and a notice shown, the notice's box
  and the sheet's do not meet, at 390 px and at 900 px; with no sheet, the notice is where it was.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`.
