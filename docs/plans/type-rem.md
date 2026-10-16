# The type scale in rem

> 2026-10-17 · step 1 of the rem plan (`evaluacion-2026-10-16/propuesta-rem-pwa.md`; Luis: «Procede»). The type
> scale and its leadings were px, so text didn't grow for anyone who asks their browser for larger text. Zoom still
> works, so WCAG 1.4.4 was met either way. Studio only.

## What changes

- **The ten tokens move to rem:** `--type-*` (six sizes) and `--lh-*` (four leadings) in `theme.css`.
- **At the browser's own size (16 px) nothing moves:** the scale is still 28, 15, 14, 13, 12 and 10.5 px, on 16, 20,
  24 and 32.
- **A person who asks for larger text** (a browser default of 20 px, say) gets every token-set text and its leading
  larger by the same ratio.
- **The root keeps no size of its own,** so rem follows the browser.

## Not yet (the plan's next steps)

- **The 153 font sizes written in px** stay px for now, so at a larger default they don't grow. Step 2 moves them to
  the nearest token, area by area.
- **The 233 fixed heights** may clip text that grows. Step 3 makes controls grow with their words, and step 4 adds a
  check at 125 % that nothing clips.

## Checks

- **`type-rem.spec.ts`:**
  - at the browser's own size, each token draws as it did;
  - at 125 %, each grows by 1.25, and the body's text with them.
- **`section-heads.spec.ts`** read the tokens' raw text with `parseFloat`. It now reads what a probe draws, in px.
