# The third ink reads

> 2026-10-07 · Luis's queue: the «$20» treatment, area by area. A measured audit of Home, Personal, the room,
> Knowledge and Updates at 1280 and 390 px found one finding everywhere.

## The finding

`--text-3`, the third ink (`rgba(236, 235, 241, 0.44)`), reads at 3.8:1 on the void and the plane. It carries words
people read: the project bar's other views and «Up to date», Home's date line, notes and project rows, the room's
«Sophia joins when asked.», the lens choices not pressed. WCAG asks 4.5:1 for text this size.

## What changes

- `--text-3` goes to 0.52: 4.8:1 or more on the void, the plane and a raised plane, still well under the second ink
  (0.66), so the order of the three inks holds. One token, every use.

## Checks

- On Home, Personal, the room, Knowledge and Updates, at 1280 and 390 px, every word at rest reads at 4.5:1
  (`e2e/ink.spec.ts`).
