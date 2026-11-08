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
Ending commit/tree: `9fb436160` (the review round's last test change); the next commit changes only the note and this
record. Files changed against `953e5dc3d`: `SourcesList.tsx`, `CitedText.tsx`, `cited-text.ts`, `cited-text.test.ts`,
`e2e/cited-text.spec.ts`, `e2e/report-reading.spec.ts`, `fixtures/cited-text-data.ts`,
`docs/plans/sources-show-text.md`, and this record.

## Outcome

- **A · Show text only where a text opens.** A project source whose type is not plain text or Markdown (row 6 of the
  long reading report, `application/pdf`) no longer offers «Show text». In its place, a still `<p>` in the row's quiet
  ink: «Only plain text and Markdown open here.» The row and the read's check share one rule, `opensAsText`
  (`cited-text.ts`), which is exactly 0090's (`split_part(lower(s.mime),';',1)`, `0090_cited_report_text.sql:45`):
  lowercased, the part before any ';', untrimmed. The 256 KiB limit is not checked from the row: `ReportSource` carries no size,
  so the read stays the one to refuse (plan `cited-report-text.md`).
- **B · Each press names its source.** The press's accessible name is «Show text of citation N» («Hide text of
  citation N» open), from the same words as the region's name; a source the text cites nowhere is named by its row's
  title, «Show text of <title>» (`citedTextPress`). Its visible words are unchanged and lead the name (WCAG 2.5.3). It
  is also described by its row's title (`aria-describedby`).

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
- **Review round** (independent review, no P1/P2; three asks):
  - type rule (`78b2b0f6c`, the `test:` commit «Show text is offered for exactly the types the cited-text read
    serves»): `cited-text.test.ts` failed at `opensAsText('Text/Markdown ; charset=UTF-8')`, `actual: true`,
    `expected: false`; fixed in `8a16bc3e3` by dropping the trim (unit 9/9).
  - uncited names: with `cites=inputs` (a second, titled uncited input in the fixture),
    `getByRole('button', { name: 'Show text of A source from the project', exact: true })` gave `Expected: 1`,
    `Received: 0` (`pw-logs/st-d-red.txt`, `331fdb213`), after the two presses were found; the unit case failed on
    `'Show text of a source not cited in the text'`. Fixed in `e73686b0b`.
  - checks (`9fb436160`): the still line is asserted before «no press», so that check cannot pass for want of a
    version; the 320 px `scrollWidth <= clientWidth` on a wrapping `<p>` (which always passes) is replaced by each line
    box of the words' range, measured inside the row.
  - after the round: `cited-text`, `report-reading`, `knowledge-origins` and `app-auth`'s matching cases, 39/39
    (`pw-logs/st-r2-green.txt`); again on the final tree `9fb436160`, 39/39 (`pw-logs/st-r2-final.txt`).
- Measured, not eyeballed: the line's contrast by `lowContrast` in the room and on paper (`theme=light`, `data-theme`
  checked); at 320 px its box and each line of its words inside the row, the box inside the pane, no page overflow; not a press (no `button`, `a` or
  `role=button` ancestor, `cursor: auto`, no underline).
- Whole-repo `oxlint --type-aware` (exit 0), `tsc --noEmit -p apps/studio` (exit 0), Prettier on every touched file.

## Decisions and changes

- **The line lives in `CitedText`, not in the row**, so it goes with the report when the report is withheld, as the
  press does.
- **A name and a description**: the name is unique by citation, or by title where uncited; the description gives the
  row's title for cited ones too.

## Remaining obligations

- Known limit, already on main: `SourcesList.tsx:67` gives `citing` to every project input whatever its size or
  whether it is kept inline; neither is on `ReportSource`, so a large or stored-as-file text still offers Show text and
  is refused by the read. Documented in the note.
- Two untitled uncited inputs would both read «Show text of A source from the project» (the row's own words); only
  titles or citations can tell them apart, and the row shows nothing more.
- CI is the run on record. `app-auth.spec.ts`'s cited-text case finds the press by `name: 'Show text'` (a substring),
  which still matches (run locally, above).

## Next bounded action

- Luis: say whether this joins the next batch. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the hunt report only.
