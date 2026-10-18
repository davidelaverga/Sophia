# A linked task in two lines, and the sheet's keys beside their presses

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), V1 and DL-12, from Luis's «Sigue con la cola …
> y el nuevo informe-25». Studio only; no API change and no new copy.

## What was measured

- **V1:** a task's «Waits on» and «Waited on by» rows broke the name a word a line beside its status: «Write the rollout
  note» in 3 lines at 1440 px and 4 on a phone, the name track ≈60 px. The `auto` track (the status sentence) took its
  whole width before the `minmax(0, 1fr)` name track got any. The board's «Closed work» rows had the same squeeze, and
  «Observed outside the plan» put its name in the mark's 8 px track (it has no mark).
- **DL-12:** the sheet's foot said «H hold or resume · S stop» whenever the plan was in force, also where no press is
  drawn: the demo, a reader, a stale read, a task that only asks. The keys did nothing there.

## What changes

- **`.task-link` (board.css):** two columns, the mark and the text. The name sits over where it stands, both in the last
  column, so a row with no mark gives them the whole row. The mark sits on the name's first line (`1lh`).
- **`sheetKeys` (actions.ts, pure):** H has a press while Hold or Resume is offered, S while Stop is, with a target and
  a port to send through: exactly what «Act on it» draws.
- **`Foot` (TaskSheet.tsx):** the plan's line, J and K, then H and S only as `sheetKeys` says.

## Checks, written first

- `actions.test.ts`: `sheetKeys` names H and S beside their presses (Hold or Resume, Stop alone) and neither when
  nothing is pressable (denied, a question only, guidance only, no port, no acts, and an offer with no target).
- `task-links.spec.ts`: «Waited on by» at 1440 px and on a phone: each name in at most 2 lines, its status under it on
  the same left edge, the name ≥ 90 % of the row, the mark on the first line, nothing past the screen; work outside the
  plan gives its name the row.
- `task-keys.spec.ts`: J K H S exactly, also once H presses Resume; a reader, a stale read and a task that only asks
  show J K only.
- `views-goals.spec.ts`: the demo's running task, which offers no press, shows J K only.

## Left

- V13: J and K still show on touch screens, where there is no keyboard; with `Foot` apart, that is one CSS rule.
