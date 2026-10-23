# The evaluation reports the notes cite, registered in the source map

> 2026-10-22 · Luis's open question on the reports the notes lean on (informe-claro's D1–D24 and plan rows,
> informe-30, informe-25, informe-ui-premium, the seams, the baseline and its measurements, the P2 lists): none is in
> the repository nor in `docs/SOURCE_MAP.md`. Answered with the coordinator's recommendation, «register, don't commit
> the reports»; Luis 2026-10-22: «Procede con la P2 y pon tus sugerencias a las preguntas». Docs only, no code.

## Measured

- **34 report documents are cited by name** across `docs/plans` and `docs/handoffs` (300 notes cite at least one:
  174 plans, 126 handoffs; most cite a single report), and 57 files under `apps/`, `scripts/`, `tests/` and `packages/` cite seven of them in comments. The most cited:
  informe-25 (31 notes), costuras (28), informe-30 (27), linea-base (22), informe-ui-premium and informe-claro (18 each).
- **Every one resolves** in Luis's evaluation folder (`D:/Descargas/Evaluación crítica de Sophia AI/`): each bare name
  matches one file there, and each cited `evaluacion-YYYY-MM-DD/…` path exists (the few cut short, such as
  `capturas/everywhere-`, are a family of files by that prefix). No cited name lacks a file, so no row is invented.
- **One name is two files:** `informe-e2e-real.md` exists in `evaluacion-2026-10-14/e2e-real/` and
  `evaluacion-2026-10-16/e2e-real/`. Every citation is the first (its Q1–Q3 and S1–S3 ids; the full path where one is
  given); the second is never cited and gets no row.
- **No docs check exists.** `package.json` has none, CI runs none, and Prettier ignores `**/*.md` and `docs/`. Nothing
  checks that a cited source resolves.

## What changes

- **`docs/SOURCE_MAP.md` §4**, after the facts learned at the pin: one row per cited report (`EVAL-*` ids), with its
  path relative to the evaluation folder, the date it states (else its folder's), one line on what it is, and how many
  notes cite it. The section says once that every row is external: Luis owns them, they live outside the tree, they
  are not reproduced here, and a note's citation (a §, row or D-number) is to the file as it stands there. The
  captures and measurement files beside the reports get one row by folder, not one per file.
- **`docs/README.md`**'s line for the map names the reports too.
- Nothing from the reports is pasted: no findings, no quotes, no names of people beyond the owner.

## Checks

- A throwaway script in the session's scratchpad (not committed: there is no docs check to join) lists every report
  name the notes cite and fails for each one without a §4 row, and for each §4 path that doesn't exist in the folder.
  Before §4: 34 of 34 unregistered (exit 1). After: 0 (exit 0).

## Limits

- The registry is a snapshot of 2026-10-22: a new note citing a new report adds its row by hand, as upstream sources
  are added (AGENTS.md).
- The folder is on Luis's machine: on another machine the paths name where the files are, not something to open.
  Two lists are living documents (`follow-ups-p2.md`, `seguimientos-p2.md`), kept up to date after their dates.
