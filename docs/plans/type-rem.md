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

## Larger text, measured (Codex P1 on #421)

- **Codex's concern:** step 1 alone lets text outgrow the fixed heights around it. Instead of moving the 233 fixed
  heights to rem blindly (the plan's step 3), `type-rem-fit.spec.ts` measures what overflows. It covers every main
  page and the states that open more, at 125 % and 150 % (Chrome's «Large» and «Very large»), on a computer and on a
  phone.
- **What it found:**
  - at 125 %, nothing;
  - at 150 %, four boxes: Home's «/» key, a session's role in Resources, the restart a session asked once the role
    grew (Codex's own `.effort-asked`), and Updates' «Still open» on a phone;
  - at every size, Tasks was 18 px wider than the window, from Hold's centred tip at the content's edge.
- **The fixes, only where it measured:**
  - a key is 18 px at least and grows with its letters;
  - the role's column is 5.25rem (84 px at the default size);
  - the restart line is 18 px at the default size, a line of larger text past it, and never wraps under its height;
  - Updates' kinds keep their words on one line, and their strip scrolls in a column that may be narrower than it;
  - Hold's and Resume's tips align to their ends, as Stop's does.
- **Every other fixed height** holds its text at both sizes, so it stays px.

## Not yet (the plan's next step)

- **The 153 font sizes written in px** stay px for now, so at a larger default they don't grow. Step 2 moves them to
  the nearest token, area by area.

## Checks

- **`type-rem.spec.ts`:**
  - at the browser's own size, each token draws as it did;
  - at 125 %, each grows by 1.25, and the body's text with them.
- **`section-heads.spec.ts`** read the tokens' raw text with `parseFloat`. It now reads what a probe draws, in px.
- **`type-rem-fit.spec.ts`:** at 125 % and 150 %, on a computer and on a phone, no box lets a line of its words out,
  and no page gets wider than the window.
  - A line is measured against the box it is laid out in. Down, by the band its letters take (an em around the line's
    middle), so a tight heading's line counts as fitting. Across, word by word, so a space ending a line may hang as
    CSS lets it.
