# Implementation-session handoff

Goal and attempt: REPORT-PAGE-WINDOWS (the report page's checks failing on Windows; Luis: «Corrige esos 2 fallos»),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `test/report-probes-windows` from `origin/main` (`330407e4`)
Writable scope: this worktree only (`packages/report`, `apps/studio/e2e`, `docs/plans`, `docs/handoffs`).
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI (Linux) as the
run on record.
Existing authority: Luis 2026-10-16, «Corrige esos 2 fallos»; merges on green with no open P1.
Ending commit/tree: `2618af1c68ff` (tree `b32fe42d9d5b`), the last commit of `test/report-probes-windows`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 7 files changed against
`origin/main` at that commit: `e2e/report-probes.ts`, `src/features/artifacts/artifacts.css`, `src/features/artifacts/reader-stack.test.ts`, `docs/handoffs/REPORT-PAGE-WINDOWS-attempt-1.md`, `docs/plans/report-page-windows.md`, `packages/report/src/page-css.ts`, `packages/report/src/report-page.test.ts`. The review notes below name the commit of each later change.

## Outcome

- **`page-css.ts`:** «Sitka Text» left `--font-text`.
  - The pinned page digest in `report-page.test.ts` moved (`25d6fc74…`, from `f5676191…`), with its note.
  - A unit assertion keeps Sitka out.
- **The Studio's Document tab** (`artifacts.css`, `.md`) sets the same faces as the page, so a report keeps its lines
  between the Studio and its download (Codex P2 on #400).
- **`report-probes.ts`** (test-only):
  - `FONTS` uses forward slashes, keeping its trailing `/`;
  - `openingSize` reads a paragraph's opening across items, composed (NFC), and the size stays the item's own.

## Evidence

- Plan: `docs/plans/report-page-windows.md`, with the characters a line by font on Windows: Sitka 57, Cambria 65,
  Georgia 62–63, Liberation Serif 69.
- **Written first and failing:**
  - the unit assertion (the commit of the tests);
  - `reader-stack.test.ts` (Codex P2), which failed on Sitka Text in the Studio's stack;
  - the e2e checks C1, C9 and C17, which already failed on Windows on a clean `main`.
- **Found while measuring:** pdfjs gives Cambria's «ó» as its own decomposed item («o» + U+0301), which the size check
  missed.
- **After the change, on Windows:**
  - `report-page`, `report-reading` and `report` specs: 99/99;
  - the report package's units and the parity check: 29/29 in the last run;
  - type-aware lint, typecheck and Prettier are clean.

## Decisions and changes

- **Sitka Text leaves both text stacks,** the page's and the Studio's Document tab: on Windows it set the measure under
  the page's own 60 characters, and Cambria sets 65.
  - Mac (Charter) and Linux (Liberation Serif) are unchanged.
- **`reader-stack.test.ts` keeps the two stacks equal,** face by face.
- **The pdfjs probes are test-only.**
- **Scope:** no new authorization was needed. The work stayed in the report package, the Studio's reader stack and the
  e2e probes.

## Remaining obligations

- None. CI (Linux) keeps Liberation Serif and the old item shapes, so its runs are unchanged.

## Next bounded action

- Luis: merge #400 on green with no open P1.
- Source IDs consulted: none from the source register. The work read only this repository's report package and Studio,
  pdfjs-dist 6.3.289's `NodeBinaryDataFactory` (the trailing-slash rule), and the fonts installed on Luis's Windows host.
