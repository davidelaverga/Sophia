# Home and the personal space keep to the app's type scale

> 2026-10-10 · Luis: «Bring it into the type scale», after captures of both pages as they were and with each size off
> the scale moved to its nearest on it. No API change.

## What was measured

- The work views keep to the scale (`type-scale.spec.ts`: label 10.5, small 12, body 13, title 14; headings 15, 16, 18,
  20). Home and the personal space didn't: Home at 11 and 13.5 (12.5 on a phone), the personal space at 10, 11 and 17.
- Home's 13.5 came from the page's base (`body`, 13.5 px), which any text without a size of its own inherits; the
  token for body text is 13 (`--type-body`).

## What changes

- The page's base is the body token (`--type-body`, 13 px).
- In `personal.css` (Home and the personal space), each size off the scale goes to its nearest on it, as the captures
  showed: 12.5 → 12, 13.5 → 13, 11 → 10.5, 10 → 10.5, 17 → 16 (Sophia's words in the conversation).
- Kept, said so: Home's greeting, a display line that grows with the screen; an initial in its circle (`.pdot`), a
  glyph sized to it, as the board's avatars are.

## Checks (written first)

- `type-scale.spec.ts` covers Home and the personal space, on a wide screen and a phone (the greeting and the fixture's
  label left out): it failed on each (11, 13.5, 12.5; 10, 11, 17); with the change, it passes, the work views too.
- The pages the base reaches: `brand`, `home`, `ink`, `join`, `opening`, `personal-carry`, `signin`, `type-scale`
  pass unchanged; in `personal`, two checks held the old sizes (its five sizes, and her turns at 17 px): they say the
  scale now (four sizes; hers at 16, a size above yours at 15), and `personal` passes (98).
- Mutants, with a control that passes: the base back at 13.5, her words back at 17, a time back at 11, Home's
  numbers back at 11: each fails.
