# Sources: «Show text» only where a text opens, and named for its citation

> 2026-11-08 · Two findings of the main hunt (`evaluacion-2026-11-08/caza-main.md`, findings 2 and 4), both in a
> report's Sources tab (`SourcesList.tsx`, `CitedText.tsx`, `cited-text.ts`; the read is `cited-report-text.md`).
> Luis 2026-11-08: «Procede y corrige»; he approved the still line's words. Studio only; no API, contract or fixture
> answer changes.

## Measured

- **A press that can never open.** Every project input's row offers «Show text» (`SourcesList.tsx`, `citing` for
  `kind === 'input'` only). The read behind it (0090, A11) serves only plain text or Markdown kept inline, at most
  256 KiB, and every other type is the one refusal (422). The row already knows the type: `ReportSource.mime`. On
  the long reading report (`fixtures/reading-data.ts`), row 6, «Ostrava Systems terms of service, section 14
  (assignment)», is `application/pdf` and offers «Show text»; pressed, it reads for seconds and ends in «The text
  couldn’t be read.» on the fixture, «This source can’t be read here.» on the API: it sounds like a permission, when
  the reason is the format, which the Studio knew before the press.
- **Four presses with one name.** In the demo's pilot readout the Sources tab holds four project inputs, and each press
  is named «Show text», with no label or description. A screen reader's list of buttons shows four equal entries; only
  the region, once open, says «Text of citation N» (`citedTextRegion`).
- **Size is not known before the read.** `ReportSource` has `mime` and no byte count (`generated-types.ts`), so the
  256 KiB limit cannot be checked from the row. Per the plan (`cited-report-text.md`: a record past 256 KiB is refused
  as one `not_found`), it stays the read's to refuse; nothing is guessed from the row.

## What changes

1. **The press only where a text opens.** `opensAsText(mime)` in `cited-text.ts` answers with the same rule the read's
   check uses (`TEXT_TYPES`: `text/plain`, `text/markdown`, parameters and case aside); `checkedCitedText` reads the
   type through the same helper, so the row and the check cannot drift. Any other type shows, in the press's place, a
   still line: «Only plain text and Markdown open here.» It is a `<p>` in the second ink at the small size, as the
   row's other quiet words and the read's own notes (`muted source-text-note`): not a press, nothing to hover, no
   pointer. It goes with the report when the report is withheld, as the press does.
2. **Each press names its citation.** The press's accessible name is «Show text of citation N» (or «…of a source not
   cited in the text»), and «Hide text of citation N» once open, from the same words as the region's name; its visible
   words stay «Show text» / «Hide text», so the name starts with the label (WCAG 2.5.3). It is also described by the
   row's title, so two sources not cited in the text still differ.

## States

| State | Screen | Keyboard and screen reader |
|---|---|---|
| plain text or Markdown (any parameters) | «Show text», as before. | A button named «Show text of citation N», described by the row's title. |
| any other type (PDF, HTML, JSON, CSV) | «Only plain text and Markdown open here.» in place of the press. | Read as text in the row; no button, no tab stop. |
| open | As before; the press reads «Hide text». | Named «Hide text of citation N»; the region keeps «Text of citation N». |
| over 256 KiB (unknown to the row) | Offered, and refused by the read as today. | |
| report withheld | Press, line and text go with the report. | |

## What does not change

The read, its checks and refusals, the region's name, the press's visible words and place, and every web page or
search result row (which never offered it).

## Checks

- `cited-text.test.ts`: `opensAsText` for each type, parameters and case; the press's name open and closed, cited and
  not.
- `report-reading.spec.ts`: the PDF row offers no press and shows the line, not clickable-looking, at 4.5:1 in the
  room (dark) and on paper (light); at 320 px the line stays inside its row, the pane and the page.
- `cited-text.spec.ts`: the text row (`text/plain; charset=utf-8`) still offers the press and no line; in the demo's
  four Markdown inputs, each press is found once by its citation's name, keeps «Show text» on screen, is described by
  its row's title, and opens the region of the same citation.
