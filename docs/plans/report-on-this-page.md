# A long report's «On this page»

> 2026-11-16 · Lote 18, item 13 (evaluacion-2026-11-16/textos-lote-18.md, «En la llamada y en los informes»). Luis
> approved the line: with four sections or more, a side index «On this page» on the anchors that already exist.

## Why

- A report's Markdown (`MarkdownView`) gives every heading an id, `md-<anchor>` (the anchor the service computes,
  `anchorOf`); Search's hits already land on them (`useSectionArrival`). Nothing on screen uses them: a six-section
  report is read by scrolling only.
- **The column:** the Document tab reads in one measure (`--measure`, 34rem). In the side pane (560 px) the column is
  the pane; enlarged, the body's children are centred at 780 px and the text keeps the measure (artifacts.css), so at
  1280 a margin of about 340 px stands left of the text, empty.

## What changes

- **Which sections:** the report's top headings under its title. A top-level heading heard once and first is the
  title, and the sections are the next level present; otherwise the top level is the sections (`pageIndex`,
  page-index.ts, pure and unit-tested). Fewer than four: no index.
- **Where:** `MarkdownView` renders `<nav aria-label="On this page">` just before the text, with an ordered list of
  links, one per section, each to its heading's id.
  - Enlarged and at least 1100 px wide: the list stands in the left margin, sticky at the top of the reading area, and
    takes no room from the column (a zero-height sticky row; the list is placed beside the measure). The column keeps
    its centre.
  - Elsewhere (the side pane, a phone): one button, «On this page» (`aria-expanded`), opens the list in place above the
    text. Choosing a section folds it again.
- **A link:** the app's routes are paths, so a press is the link's own: it brings the heading to the top of the
  reading area and gives it the focus (as `useSectionArrival` does), with no change to the address. Middle-click and
  the link's address keep `#md-<anchor>`.
- **The one read:** `aria-current="location"` on the section whose heading last passed the top of the reading area
  (the first, before any has), read again on the reading area's scroll, once a frame.
- A repeated heading keeps its occurrence: each section heading carries its place (`data-section`), and the link goes
  to that element.

## Checks

`report-index.spec.ts`: enlarged at 1280, the six links in order, the list left of the column by 16 px or more and the
column centred, no button; a link pressed by keyboard brings its heading within 40 px of the top, focused, marked
current, the address unchanged; back at the top, the first is current. In the side pane: folded, opened by keyboard,
a link goes and the list folds. On a phone: folded, opens, no sideways scroll. A two-section report: no index.
`page-index.test.ts`: the title rule, a report without a title, fewer than four.

## Not changed

The headings, their ids and anchors, the measure, the designed HTML page (its own document), Search's arrival.
