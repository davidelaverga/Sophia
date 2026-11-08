# Implementation-session handoff

Goal and attempt: SOURCES-SHOW-TEXT (the main hunt's findings 2 and 4, `evaluacion-2026-11-08/caza-main.md`: «Show
text» offered on a PDF that can never open, and four «Show text» presses with one name; Luis 2026-11-08: «Procede y
corrige», with the still line's words approved), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `sources/show-text-where-it-opens` from
`origin/main` `953e5dc3d` (everything through #500 merged; not pushed)
Writable scope: this worktree only (`apps/studio/src/features/artifacts`, `apps/studio/e2e`, `docs/plans`,
`docs/handoffs`); no API, contract or fixture change.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard); CI as the run on record.
Existing authority: Luis, the quotes above; local only, nothing pushed.
Ending commit/tree: the fix commit for item B (the last that changes code); the next one adds only this record. Files
changed against `953e5dc3d`: `SourcesList.tsx`, `CitedText.tsx`, `cited-text.ts`, `cited-text.test.ts`,
`e2e/cited-text.spec.ts`, `e2e/report-reading.spec.ts`, `docs/plans/sources-show-text.md`, and this record.

## Outcome

- **A · Show text only where a text opens.** A project source whose type is not plain text or Markdown (row 6 of the
  long reading report, `application/pdf`) no longer offers «Show text». In its place, a still `<p>` in the row's quiet
  ink: «Only plain text and Markdown open here.» The row and the read's check share one rule, `opensAsText`
  (`cited-text.ts`), so they cannot drift. The 256 KiB limit is not checked from the row: `ReportSource` carries no size,
  so the read stays the one to refuse (plan `cited-report-text.md`).
- **B · Each press names its citation.** The press's accessible name is «Show text of citation N» («Hide text of
  citation N» open; «…of a source not cited in the text» otherwise), from the same words as the region's name
  (`citedTextPress`). Its visible words are unchanged and lead the name (WCAG 2.5.3). It is also described by its row's
  title (`aria-describedby`), so two uncited sources still differ.

## Evidence

- **A, written first and failing** (`pw-logs/st-a-red.txt`): both theme cases fail at
  `getByRole('button', { name: /text/i })` in the reading report's Sources, `Expected: 0`, `Received: 1` (the PDF's
  press); the 320 px case fails at the line, `element(s) not found`. `cited-text.test.ts` failed to load:
  `does not provide an export named 'opensAsText'`.
- **A, green** (`pw-logs/st-a-green.txt`): the three cases and the plain-text row's case, 4/4; unit 8/8.
- **B, written first and failing** (`pw-logs/st-b-red2.txt`): the four toggles are there, and
  `getByRole('button', { name: 'Show text of citation 1', exact: true })` gives `Expected: 1`, `Received: 0`; the unit
  file failed to load on `citedTextPress`.
- **B, green**: unit 9/9; `cited-text`, `report-reading` and `knowledge-origins` specs in full through the guard, 37/37
  (`pw-logs/st-b-green2.txt`), and `app-auth.spec.ts`'s cited-text case, 1/1 (`pw-logs/st-b-appauth.txt`). A first
  green run (`st-b-green.txt`) failed only in the new test's own row locator (a `has:` locator rooted at the pane, so
  it never matched inside the row); the fix commit corrects it, the assertions unchanged.
- Measured, not eyeballed: the line's contrast by `lowContrast` in the room and on paper (`theme=light`, `data-theme`
  checked); at 320 px its box inside the row and the pane, no inner or page overflow; not a press (no `button`, `a` or
  `role=button` ancestor, `cursor: auto`, no underline).
- Whole-repo `oxlint --type-aware` (exit 0), `tsc --noEmit -p apps/studio` (exit 0), Prettier on every touched file.

## Decisions and changes

- **The line lives in `CitedText`, not in the row**, so it goes with the report when the report is withheld, as the
  press does.
- **A name and a description**, not one or the other: the name answers the hunt's check (unique by citation), the
  description tells uncited sources apart.

## Remaining obligations

- CI is the run on record. `app-auth.spec.ts`'s cited-text case finds the press by `name: 'Show text'` (a substring),
  which still matches (run locally, above).

## Next bounded action

- Luis: say whether this joins the next batch. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the hunt report only.
