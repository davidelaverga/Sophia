# Knowledge, the quiet pass: covers that read as pages, metadata in words

> 2026-10-08 · The second of three PRs after Luis's critical look at Knowledge («¿pagarías 20 dólares?»), after
> `docs/plans/knowledge-honest.md` (the errors). Builds on `docs/plans/knowledge-library.md` (the tiles) and
> `docs/plans/knowledge-quiet.md`. No API change.

## What reads as unfinished (demo, 1440 and 390 px)

- Four of six tiles show a dark sheet inside the dark cover inside the dark card, with violet mono section labels: a
  box in a box in a box that reads as a hole beside the two designed pages' paper covers.
- Every card's line is mono («HTML · v2 · 2 versions · Oct 1»), and the pane's head is a machine's line: «HTML · v2 ·
  13.6 KB · 8f0f5f73 · design checked». On a phone it wraps to three lines.
- «Edit» on a tile edits only the description, not the report.
- «Knowledge» carries a violet «REPORTS» beside it, the only view with a label after its title.

## What changes

- **A Markdown report's cover is a page:** the sheet rising from the cover's foot is paper, as a designed page's cover
  is, with its heading and first words in dark ink and its sections as quiet small labels. The library reads as one
  shelf of documents.
- **The lines say it in words:** the card's line and the pane's head in the app's sans, not mono. The head says the
  format, the version, its length (words or pages) and the design check; the size and the hash move to Download, said
  when it is pointed at or focused («13.6 KB · 8f0f5f73»), still the bytes checked.
- **«Edit summary»** for what the press does.
- **No label after «Knowledge»**, as Updates and Conversations.

## Checks (written first)

- A Markdown cover's sheet is light (its background's luminance over 0.8) and its words read at 4.5:1 on it.
- The card's line and the pane's head are not mono.
- A designed page's head reads «HTML · v2 · design checked»; Download says «13.6 KB · 8f0f5f73» as its description.
- The tile's press reads «Edit summary»; the view's head holds only «Knowledge».
- The existing Knowledge checks pass with their words updated.
