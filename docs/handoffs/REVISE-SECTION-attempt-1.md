# Implementation-session handoff

Goal and attempt: REVISE-SECTION (ask Sophia to revise sections of a report's page; item 3 of Luis's queue), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `ui/revise-section` from `main` (the API exists, not stacked)
Writable scope: this worktree only (`apps/studio`, `packages/contracts`, `docs/plans`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `f559296a5122` (tree `ef1cac1aa0d8`), the last commit of `ui/revise-section`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 15 files changed against
`origin/main` at that commit: `e2e/revise-section.spec.ts`, `fixtures/fixture-api.ts`, `fixtures/room.tsx`, `src/api/artifacts.ts`, `src/features/artifacts/DocumentPane.tsx`, `src/features/artifacts/HtmlView.tsx`, `src/features/artifacts/ReviseSections.tsx`, `src/features/artifacts/artifacts.css`, `src/features/artifacts/page-sections.test.ts`, `src/features/artifacts/page-sections.ts`, `docs/plans/revise-section.md`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated/validators.d.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.ts`. The review notes below name the commit of each later change.

## Outcome

- **`page-sections.ts`** lists a designed page's sections from its checked text, never parsed into the Studio's DOM:
  each `data-section` id DesignEditRequest accepts, in page order, once, named by its `aria-label`, else its first
  heading's words, else its id.
- **The viewer:** beside the designed page's review sentence, «Revise with Sophia…» for editors and admins on the
  current version, when the page names a section.
  - The sheet «Revise the page»: the sections as checkboxes (at most 16), «What to change» (at most 2,000
    characters), «Ask Sophia».
  - `requestDesignEdit` (`POST /html-edits`, SDD-01 G5) with the version, the sections in page order and the trimmed
    words, under one key per edit: a retry of the same words is the same edit, changed words a new one.
  - Admitted: «Sophia is revising the page. Its next version will appear here.» A refusal is said in the API's words.
- **Contracts:** `parseDesignEditReceipt` (generated validator).
- **Viewers** and older versions get nothing to press; the frame keeps no permission at all.

## Evidence

- Plan: `docs/plans/revise-section.md`.
- Written first and failing (commit `030ac1fe`): `page-sections.test.ts` (no module) and `revise-section.spec.ts`
  (no button).
- **After the change, locally:**
  - `page-sections.test.ts` 2/2;
  - revise-section and report specs: 62/62;
  - a capture checked the button, the sheet and the admitted state; it showed the instruction's field one line high,
    so it got a minimum height (`fix: room to write what to change`);
  - type-aware lint over the whole repo, typecheck and Prettier are clean.

## Remaining obligations

- CI; Codex with no open P1.
- The next version arrives as any published version does (the live offer); nothing here watches the task.
