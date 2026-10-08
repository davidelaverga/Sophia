# Knowledge as a library: each report with its cover (K1)

> 2026-10-07 · Luis approved the «$20» critique of Knowledge and asked to start here: «arranca con K1 y luego itera
> sobre esa nueva versión».

## The gap (measured, 1440 px, `?demo=1`)

- The readout's designed page, the most useful thing the project has, shows as a 56×26 «● HTML» tag. The card's tile
  says «MD» whatever the formats.
- Nine type sizes in a view of about 100 words: 20, 15, 13.5, 13, 12.5, 12, 11.5, 11 and 10.5 px.
- The meta line repeats itself: «v1 · 1 version · updated Oct 1».
- A card is a column of seven parts read top to bottom; nothing of the report itself is seen.

## What changes

**The reports become tiles in a grid,** as wide as the view allows (columns of at least 260 px).

**Each tile opens with a cover:**

- **A report with a designed page:** the cover is that page's first screen, scaled down. It is the same checked bytes
  the viewer shows, in the same frame with no permission: no scripts, no same origin, nothing it can load or send. It
  is hidden from screen readers and inert (no focus inside it, not even on its links), because the press over it says
  what it is: «Open {title}, HTML page».
- **A Markdown report:** the cover is its first lines, typeset as a page: its first heading, then its opening words,
  without citation ids or emphasis marks. They are drawn as text, never as HTML.
- **Lazy:** a cover reads its report only once its tile comes near the screen. It uses the viewer's own reads (the same
  query keys), so opening the report after reads its page and text from what the cover read. A designed page's frame
  is there only while its tile is within reach: scrolled far away, the checked page stays in the cache, not as a live
  document, and comes back without a new read.
- **Until it arrives,** the cover is a quiet plane of the same size. A read that fails or does not match its hash leaves
  the format's monogram (HTML, PDF or MD), never a broken frame.

**Pressing the tile:**

- The cover of a designed page opens the designed page.
- Anywhere else (the title, a Markdown cover, the words) opens the report, as the title does today.
- Edit and History and changes keep their own presses, above the tile's.

**One meta line,** in mono: the formats, the version, the count of versions when there is more than one, and the day.
For example «HTML · v2 · 2 versions · Oct 1»; with all projects shown, the project first.

**Four type sizes,** the app's tokens: title 14, description 13, attribution, History and the meta line 12 (the meta in mono), and the cover's labels 10.5 mono.

## Not in K1

- The filters, the search key and the order of what was carried in (K2).
- The demo's fuller library (K2).
- Conversations (C1–C3).

## Checks (written first)

- A tile with a designed page shows its first screen in a frame with no permission, from the checked bytes, hidden
  from screen readers; the press over it opens the designed page.
- A Markdown tile's cover shows its first heading and words as text, with no citation id.
- A cover whose page does not match its hash shows the monogram, and no frame.
- A cover scrolled far away keeps no frame; scrolled back, it shows the same page with no new read.
- The meta line: «v2 · 2 versions» kept; no «1 version»; no «updated».
- The tiles' type sizes are at most the four tokens.
- At 390 px one column, nothing past the screen; at 1440 px three columns or more.
- The existing Knowledge checks (description edit and its focus, More reports and its focus, filters, CX-0026 and the
  HTML card) pass unchanged.
