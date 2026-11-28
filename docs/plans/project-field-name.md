# One name for the project field

> 2026-11-27 · Luis: «Sigue con la cola de mejoras de UI». Half of P3-22 of the independent evaluation
> (`evaluacion-2026-11-22/evaluacion-independiente.md`). Studio only; no new words.

## Seen

The field that names a new project is «Project name» in the first run (first-run.ts) and in Rename (ProjectName.tsx),
but «Project title» in Work's New project (WorkSpace.tsx, a label only screen readers hear).

## Change

- Work's label says «Project name» too. The placeholder «Name the project» stays.
- The specs that found the field by its old label (app-auth, archive-project) find it by the new one.

## Not changed

- The other half of P3-22: a project made from Work doesn't open Invite, while the first run's «With a team» does.
  That is a choice of flow, left for Luis.
- P3-8 («viewer · email sent» beside «Viewer» in the select): the invitation's state is a mono line whose every state
  is lowercase («joined», «expired», «editor · email sent»). Kept as it is.
- The fixture's «Tip: press ? …» over «WORK PULSE» at 1280 × 800 (the evaluation's «Tras bandera») doesn't show on
  `work.html` at 1280 × 800 today.

## Checks

- E2E: `archive-project.spec.ts` (the field is visible by «Project name») and `app-auth.spec.ts` (filled by it).
  Seen in the browser pane: Work → New project focuses a field labelled «Project name».
