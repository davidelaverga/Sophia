# The room on a phone: who holds the floor, said in the room; Decline as tall as Let in

> 2026-10-13 · Luis: «Sí, empieza con la PR 1», after `informe-sala-20.md` (¿Vale $20? · La sala), findings 3 and 4.
> Finding 2 (words under the dock's icons) is left out: on 2026-10-07 Luis chose icons only for the phone's dock
> (docs/plans/phone-dock.md), since short words don't fit at 390 px.

## What was measured

- At 390×844 in a call, the people beside Sophia's light say «Luis · you» and nothing more: up to 760 px `.presence
  .role` is hidden with the meter. The phone's dock hides who holds the floor too (`.floor-name`, said to a screen
  reader only) because «who holds the floor is said in the room beside them» (phone-dock.md): with the role hidden,
  it is said nowhere a sighted person can read it.
- At the door, «Decline» is a text press 57×20 px beside «Let in» (28 px tall): under the 24 px minimum target
  (WCAG 2.5.8).

## What changes

- **On a phone, the person who holds the floor keeps their role under their name** («has the floor», in the warm
  ink). The other roles (speaking, guest, listening) and the meter stay hidden there, as now.
- **«Decline» is as tall as «Let in»** (28 px), its words and look unchanged.

## Checks

- `e2e/room-phone-floor.spec.ts`: at 390 px with the floor held, «has the floor» is drawn under that person's name;
  another person's role stays hidden; at the door, Decline's height equals Let in's (desk and phone).
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; the room specs
  through the guard.
