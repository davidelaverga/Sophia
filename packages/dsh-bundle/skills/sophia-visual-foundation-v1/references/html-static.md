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
- **The static profile (enforced by Sophia's parser, not only advised):** no `script`, no event-handler attribute, no `javascript:` URL, no form or input, no `iframe`, `object`, `embed`, `canvas`, `svg`, `img`, `video`, `audio` or `link`; no remote font, stylesheet or image; no `@import`; `url()` only for in-page fragments; no `ol` and no numbered list marker or counter (a list marker draws a bullet: a number the page generates is content no block holds); an ordered list's numbers are part of its items' frozen text ("3. Delta"), so show it as a `ul` with `list-style: none` and each item's text as the package gives it, number included, never renumbered; no `position: fixed` or `sticky` (a pinned element moves over the text as a reader scrolls, where no capture shows it: `position` is `static`, `relative` or `absolute`); `@media` and `@container` test the width only (no print, colour-scheme, motion, pointer, orientation or height query), and the page is drawn in the light scheme only (no `light-dark()`, no dark `color-scheme`, no `<meta name="color-scheme">`): the captures are taken on a screen at 390 and 1280 px in the light scheme, and a rule for any other condition applies where no capture shows it; a rule for a state the captures never take (`:hover`, `:focus`, `:focus-visible`, `:focus-within`, `:target`, `:link`, `:visited`, `[open]`…) may only set an outline or a text decoration of at most 6px, so select by place otherwise (`:first-child`, `:nth-of-type()`, `:is()`, `:has()`…) and links by `:any-link`; research blocks and source entries, and what holds or is inside them, are never `aria-hidden`; CSS draws no text: `content` is `none`, `normal`, `""` (a decorative box) or a quote keyword, and `quotes`, list markers, emphasis, hyphenation and overflow take no string, so write a mark as text in the page; no text stroke; no ARIA state but `aria-hidden` (a checked, pressed, selected, expanded, current or sorted state is announced but never shown), and `role` names only a part of the document or a landmark, never a widget; a table header's `abbr` repeats a label the page shows; nothing sits beside a block's text on its lines: a mark, a label or another block within half an em of a line reads as part of it (`-` before `10%`), so keep a word's width or more between them. One `index.html` with an optional `styles.css`; Sophia inlines the CSS into the delivered file.

## Links and accessibility [H2.1–H2.4]

- Every link has a real target: an in-page anchor that exists, or an `https`/`http`/`mailto` address shown in full in the sources list. Focus is visible on every link.
- Labels and names, keyboard order and visible focus stay coherent. Colour is never the only carrier of a meaning.
- Useful content is present without interaction; a `details` element may hold supporting detail but never the report's basic meaning.
- **Excluded:** control states, `preview_file` actions, `changed_pixel_ratio` (no scripts or controls exist in this profile).

## Runtime [H3.1]

- The render shows no broken resource, `NaN`, `undefined` or `Infinity` in visible text. **Excluded:** canvas scaling, animation previews, reduced motion.

## Validation matrix [H4.1]

Render at every target width and inspect: the first screen; every section at readable scale; the densest and the emptiest sections; keyboard focus on links; the narrowest and widest layouts.
