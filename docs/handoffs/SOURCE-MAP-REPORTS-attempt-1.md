# Handoff: the evaluation reports the notes cite, registered in the source map

Goal and attempt: SOURCE-MAP-REPORTS (Luis's open question: the notes lean on reports, informe-claro's D1–D24 and plan
rows, informe-30, informe-25, informe-ui-premium and others, that are neither in the repository nor in
`docs/SOURCE_MAP.md`; answered with the coordinator's recommendation, «register, don't commit the reports»; Luis
2026-10-22: «Procede con la P2 y pon tus sugerencias a las preguntas»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-5`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-5`, branch `docs/source-map-reports` from `origin/main`
`86eef1c21`; not pushed
Writable scope: this worktree only (`docs/SOURCE_MAP.md`, `docs/README.md`, `docs/plans`, `docs/handoffs`); no code.
Runtime unit: Luis's Windows host (Git Bash, Node 24.21); no browser, no Playwright.
Existing authority: Luis 2026-10-22, the quote above; local only, nothing pushed.
Ending commit: the branch's last commit. Against `86eef1c21`: `docs/SOURCE_MAP.md` (§4, new), `docs/README.md` (the
map's line), `docs/plans/source-map-reports.md` (new), this record.

## Outcome

- **`docs/SOURCE_MAP.md` §4** lists the 34 reports the plans and handoffs cite by name, one `EVAL-*` row each: path
  relative to Luis's evaluation folder (`D:/Descargas/Evaluación crítica de Sophia AI/`), the date it states, one line
  on what it is, and how many notes cite it; one more row, `EVAL-EVIDENCE`, names the capture and measurement folders
  notes point at. The section says every row is external, Luis's, outside the tree and not reproduced here. Nothing
  from the reports is copied in.
- **Every cited name resolves**; none was left without a file, so no row was invented. One name is two files
  (`informe-e2e-real.md`, 2026-10-14 and 2026-10-16): every citation is the first (its Q/S ids), so only it has a row.
- **No docs check exists** in the repo for the source map or for cited sources (none in `package.json` or CI;
  Prettier ignores `**/*.md`). The only docs test, `tests/unit/destination-map.test.mjs`, reads another map: 3/3.

## Evidence

- **The inventory** (scripts in the session's `scratchpad/srcmap/`: `names.mjs`, `paths.mjs`): 300 notes cite at least
  one report (174 plans, 126 handoffs); 57 files under `apps/`, `scripts/`, `tests/`, `packages/` cite seven of them in
  comments. Every `evaluacion-YYYY-MM-DD/…` path a note cites exists in the folder (five cut short, such as
  `capturas/everywhere-`, match a family of files by prefix).
- **The registration check** (`scratchpad/srcmap/registered.mjs`, not committed: there is no docs check to join): every
  report name the notes cite needs a §4 row, and every path §4 names must exist in the folder. Red on the map before
  §4 (`git show 86eef1c21:docs/SOURCE_MAP.md`): «34 report names cited; 0 paths in §4; 34 problems», exit 1. Green
  after: «34 report names cited; 53 paths in §4; 0 problems», exit 0. Control mutant (the informe-claro row dropped,
  one path renamed to `medicion-r3.md`, one folder to `sala-afterx`): 4 problems, exit 1.

| Report (cited name) | Notes citing (plans, handoffs) | File in the evaluation folder |
|---|---|---|
| informe-25 | 31 (18, 13) | `evaluacion-2026-10-17/informe-25.md` |
| costuras | 28 (14, 14) | `evaluacion-2026-10-18/experiencia/costuras.md` |
| informe-30 | 27 (15, 12) | `evaluacion-2026-10-10/informe-30.md` |
| linea-base | 22 (11, 11) | `evaluacion-2026-10-19/fiabilidad/linea-base.md` |
| informe-ui-premium | 18 (10, 8) | `evaluacion-2026-10-11/informe-ui-premium.md` |
| informe-claro | 18 (9, 9) | `evaluacion-2026-10-17/informe-claro.md` |
| informe-brechas-a-fondo | 17 (17, 0) | `evaluacion-2026-10-15/informe-brechas-a-fondo.md` |
| seguimientos-p2 | 17 (7, 10) | `evaluacion-2026-10-16/seguimientos-p2.md` |
| informe-brechas-3 | 16 (16, 0) | `evaluacion-2026-10-16/informe-brechas-3.md` |
| informe-inteligencia | 14 (7, 7) | `evaluacion-2026-10-12/informe-inteligencia.md` |
| follow-ups-p2 | 13 (8, 5) | `evaluacion-2026-10-13/follow-ups-p2.md` |
| informe-brechas-funcionales | 11 (11, 0) | `evaluacion-2026-10-15/informe-brechas-funcionales.md` |
| informe-pasada-3 | 11 (7, 4) | `evaluacion-2026-10-11/informe-pasada-3.md` |
| informe-e2e-real | 10 (5, 5) | `evaluacion-2026-10-14/e2e-real/informe-e2e-real.md` |
| informe-personal-real | 9 (4, 5) | `evaluacion-2026-10-13/informe-personal-real.md` |
| informe-vistas-20 | 8 (4, 4) | `evaluacion-2026-10-13/informe-vistas-20.md` |
| seguimientos-triage-2026-10-19 | 6 (3, 3) | `evaluacion-2026-10-16/seguimientos-triage-2026-10-19.md` |
| informe-espacios-20 | 5 (3, 2) | `evaluacion-2026-10-13/informe-espacios-20.md` |
| informe-comandos-20, informe-sala-20, informe-equipo-20 | 4 each (2, 2) | `evaluacion-2026-10-13/` |
| medicion-despues | 3 (1, 2) | `evaluacion-2026-10-19/fiabilidad/medicion-despues.md` |
| informe-cuenta-20, -resources-20, -primer-proyecto-20, -search-20, -signin-20, -updates-20 | 2 each (1, 1) | `evaluacion-2026-10-13/` |
| informe-logs-evidencia | 2 (1, 1) | `evaluacion-2026-10-15/informe-logs-evidencia.md` |
| medicion-r2 | 2 (1, 1) | `evaluacion-2026-10-19/fiabilidad/medicion-r2.md` |
| propuesta-rem-pwa | 2 (1, 1) | `evaluacion-2026-10-16/propuesta-rem-pwa.md` |
| medicion-antes | 1 (0, 1) | `evaluacion-2026-10-19/fiabilidad/medicion-antes.md` |
| p2-abiertos-pila-kit | 1 (0, 1) | `p2-abiertos-pila-kit.md` (the folder's root) |
| propuesta-davide-proyeccion | 1 (0, 1) | `evaluacion-2026-10-17/propuesta-davide-proyeccion.md` |

## Decisions and changes

- **Register, don't commit:** the reports stay Luis's, in his folder; the map says where each is and what it is.
- **Ids `EVAL-*`**, in a section of their own after §3, so they don't mix with the upstream source ids.
- **The date** is the one the report states, else its folder's: `informe-comandos-20.md` and four others in
  `evaluacion-2026-10-13/` state 2026-10-14; `seguimientos-p2.md` states 2026-10-17 and is still kept up to date.
- **Captures and measurement files** get one row by folder: a note names one as its evidence, never as its source.
- The folder's uncited reports get no row: the second `informe-e2e-real.md`, `evaluacion-2026-10-10/informe.md`, six
  more «Worth $20?» reports in `evaluacion-2026-10-13/` (contraste, conversaciones, fallos, knowledge, tareas,
  telefono), `evaluacion-2026-10-15/propuestas-davide.md`, `evaluacion-2026-10-17/pr-light-nota-papel.md` and
  `evaluacion-2026-10-20/issue-rejoin-presence*.md`.

## Remaining obligations

- Nothing keeps §4 current: a note that starts citing a new report adds its row by hand. If Luis wants it enforced, the
  scratchpad check could become a unit test, but it would read his folder, which CI doesn't have; a test could check
  only that every cited name has a row.
- The paths open only on Luis's machine.

## Next bounded action

- Luis reads §4; push with the next group PR when he says.
- Source IDs consulted: none from the source register. The work read this repository and the evaluation folder's
  file names, titles and section headings.
