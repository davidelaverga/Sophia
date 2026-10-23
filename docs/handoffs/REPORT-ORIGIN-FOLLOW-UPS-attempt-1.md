# Implementation-session handoff

Goal and attempt: REPORT-ORIGIN-FOLLOW-UPS (Codex P2s on #383, from the follow-up list; Luis: «Sigue con los P2 en local, sin subir
nada»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `knowledge/report-origin-follow-ups` from `origin/main` (`21516687`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con los P2 en local, sin subir nada»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `095d65b104fd` (tree `de649a951c0a`), the last commit of `knowledge/report-origin-follow-ups`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 5 files changed against
`origin/main` at that commit: `e2e/report-origin.spec.ts`, `src/features/artifacts/DocumentPane.tsx`, `src/features/artifacts/ReportOrigin.tsx`, `src/features/artifacts/artifacts.css`, `docs/plans/report-origin.md`. The review notes below name the commit of each later change.

## Outcome

- «What it was made for» stands above the designed HTML page and the PDF too, not only the Markdown; on the full page it keeps the designed page's edge.
- Where the report covers the page (a phone, the full page), «Made for» closes it before opening the goal in Goals; at the side size the report stays beside Goals, as before.

## Evidence

- Plan: `docs/plans/report-origin.md`, «Follow-ups».
- **Written first:** four `report-origin.spec.ts` cases failed on main's code (no origin over the designed page, so no edge either; the report still visible under the goal sheet on a phone and on the full page).
- **After the change, locally:** `report-origin` 6/6; every report and Knowledge spec: 166/166; Studio typecheck, lint and Prettier clean.
- **Capture:** `evaluacion-2026-10-17/p2-origin-html-after.png`.

## Decisions and changes

- **The Markdown keeps its order:** its origin stays after the note on a missing format; only the PDF and HTML branches gain it from DocumentView.
- **The PDF column only where the origin is** (`:has(> .report-origin)`), so the Sources and History tabs of a PDF report keep their layout.
- **`leaveFor`, as the sources' origin uses,** from viewer-context to avoid an import cycle.

## Remaining obligations

- No fixture serves a PDF rendition, so the PDF branch's layout is checked by reading only.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
