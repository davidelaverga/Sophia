# A designed page's frame waits in the theme's surface, not in white

> 2026-11-16 · `informe-ui-premium.md` (2026-10-11), «white flash»: in Knowledge, a designed page's cover frame and
> the full frame were plain `#fff` until the page painted, a white flash in the dark room. Luis: «es imposible que no se
> pueda avanzar mucho». Studio only.

## What was checked

- Both frames are sandboxed `srcdoc` iframes (`ReportCover.tsx`, `HtmlView.tsx`) whose element background was `#fff`
  (`artifacts.css`, `.report-cover-frame` and `.report-html-frame`). Until the page paints, the element's background
  is what shows.
- Once painted, Chromium draws an opaque backdrop behind a frame whose document's colour scheme differs from the
  frame element's (the room is `color-scheme: dark`; a designed page that declares none is light). Measured on a dark
  root with a sandboxed `srcdoc` frame whose background is `#121118`: with the page's stylesheet held, the frame shows
  `rgb(18, 17, 24)`; a page with no background of its own, once painted, shows `rgb(255, 255, 255)`. So the element's
  background only shows while loading, and a page that paints no background still reads as paper.

## What changes

- Both frames wait in `--surface-raised`: the room's raised plane (`#121118`) in the dark, white on paper, as before.
  On paper nothing moves, so the frame still stands as a white page on the paper ground.
- The designed page keeps its own background; nothing is injected into the frame.

## Checks (written first)

- `e2e/knowledge-library.spec.ts`: in the room, the cover frame's and the full frame's computed background is the
  raised surface, `rgb(18, 17, 24)`, not white; on paper (`theme=light`) both stay `rgb(255, 255, 255)`; inside, the
  fixture page's body keeps its own `rgb(251, 247, 239)`.
- No lever holds a `srcdoc` page's paint in the fixture (its bytes are inline and its own CSP refuses every load), so
  the check reads the element's computed background, which is what shows until the paint (measured above).
