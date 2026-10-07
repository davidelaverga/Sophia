# Knowledge, second pass: the filters, the order, a fuller library (K2)

> 2026-10-07 · After K1 (`docs/plans/knowledge-library.md`), Luis: «itera sobre esa nueva versión». The «$20» critique's
> Knowledge findings 5 and 6, and the demo's library.

## The gap (measured, 1440 px, `?demo=1`)

- **Two kinds of filter in one row:** the project filter is round pills (radius 14 px), the format filter the app's
  square `.segmented`. Their type is 12.5 and 13 px.
- **The reports come late:** what members carried in from Personal comes first, three rows, so the first tile starts at
  y = 431 on a desktop and y = 540 on a phone.
- **The demo's library is two reports,** one a page away behind More reports: a library that doesn't read as one.

## What changes

- **One kind of filter:** the project filter becomes the app's `.segmented` group, as the format filter is. Both show
  the pressed choice by a thumb, a quiet plane under its words. The counts stay, in mono.
- **The reports first:** the tiles come right under the filters. What was carried in follows them, before Connections,
  with its heading as before. It is only shown with this project's reports, as now.
- **The demo's library (fixtures only):** seven reports, six on the first page (two full rows at 1440 px), one behind
  More reports:
  - the pilot's readout, with its designed page;
  - the week-3 survey's findings, with a designed page of its own;
  - the setup checklist, the support-ticket review, the onboarding call notes and the second region's notes;
  - and, on the second page, the pilot's plan.

  Each one has its versions and its text, so its cover reads them; every hash checked.

## Not in K2

- A key for the search: `/` already opens the project's search everywhere.
- Conversations (C1–C3).

## Checks (written first)

- The project and format filters are `.segmented` groups. Their buttons share a height and a corner of at most 8 px. The
  pressed one has a plane under it.
- In the filters, only the app's type sizes (13 px for the buttons, 12 px for the counts).
- With what was carried in, the first tile is above the carried-in heading.
- In the demo, the first page shows six tiles, two of them with a designed cover; More reports brings the pilot's plan.
- The existing Knowledge checks pass unchanged (filters, More reports and its focus, carried in, the HTML card).
