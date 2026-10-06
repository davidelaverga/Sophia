---
id: foundation/html-static
source: EverMind-AI/Raven@3632e6040c7038a60ec418ce39ccae185c72c19f plugins-dist/design-engine/raven_design/skills/visual-artifact-design/references/html-and-canvas.md (blob 6a0f09958b47496863738262f2a8bfcb73d0c5a7)
status: Sophia adaptation for static, script-free HTML; JavaScript, canvas, animation and preview_file actions are excluded or replaced by design_render / design_inspect_render
---

# Static HTML

## Structure and layout [H1.1–H1.5]

- Deliver real HTML and CSS, not a picture of a page.
- Use semantic HTML (`main`, `header`, `section`, `h1`–`h4`, `p`, `ul`, `table` with `thead`/`th`, `blockquote`, `figure`, `details`/`summary`, `nav`, `footer`) and a clear structure. CSS custom properties for the visual system; flex and grid for layout. Absolute positioning only for genuinely layered local overlays.
- Prefer intrinsic sizing. Never lock text containers to fragile heights. Prevent unintended horizontal scroll, overlap and clipped focus rings.
- Recompose deliberately at the narrowest (390 px) and widest (1280 px) target; do not scale one layout. The answer and the start of the evidence are apparent in the first screen.
- **The static profile (enforced by Sophia's parser, not only advised):** no `script`, no event-handler attribute, no `javascript:` URL, no form or input, no `iframe`, `object`, `embed`, `canvas`, `svg`, `img`, `video`, `audio` or `link`; no remote font, stylesheet or image; no `@import`; `url()` only for in-page fragments; no `ol` and no numbered list marker or counter (a list marker draws a bullet: a number the page generates is content no block holds); no `position: fixed` or `sticky` (a pinned element moves over the text as a reader scrolls, where no capture shows it: `position` is `static`, `relative` or `absolute`). One `index.html` with an optional `styles.css`; Sophia inlines the CSS into the delivered file.

## Links and accessibility [H2.1–H2.4]

- Every link has a real target: an in-page anchor that exists, or an `https`/`http`/`mailto` address shown in full in the sources list. Focus is visible on every link.
- Labels and names, keyboard order and visible focus stay coherent. Colour is never the only carrier of a meaning.
- Useful content is present without interaction; a `details` element may hold supporting detail but never the report's basic meaning.
- **Excluded:** control states, `preview_file` actions, `changed_pixel_ratio` (no scripts or controls exist in this profile).

## Runtime [H3.1]

- The render shows no broken resource, `NaN`, `undefined` or `Infinity` in visible text. **Excluded:** canvas scaling, animation previews, reduced motion.

## Validation matrix [H4.1]

Render at every target width and inspect: the first screen; every section at readable scale; the densest and the emptiest sections; keyboard focus on links; the narrowest and widest layouts.
