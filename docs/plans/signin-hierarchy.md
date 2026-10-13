# The sign-in's three levels, and a wrong code said on its field

> 2026-10-13 · Luis: «Sí, empieza con las dos PRs», after `informe-signin-20.md` (¿Vale $20? · Sign in), findings 4–6.
> The provider tiles stay marks only: Luis chose icons to keep the row minimal and recognisable (finding 2 closed).

## What was measured

- On `signin.html` (main `9d9023f9`) the lede («Where your team and Sophia think together.»), the note («New here?
  The same link creates your account.») and every error are all 14/20 at weight 400: only the ink tells the lede
  from the fine print, and the note is in the same ink as the lede.
- A wrong address turns the field's border rose (`.field:has(input[aria-invalid])`); a wrong code leaves the code
  field violet, with the wrong digits in it and the focus wherever it was.
- «Check your email» says what was sent and how to use it in one paragraph of 60 px at 1440 (three lines) and 80 px
  at 390 (four), before the code field.

## What changes

- **The note drops to the screen's label size, 12/16**, in the same second ink (`.screen-body p.muted`, the status
  beside «Send again»). The screen keeps three sizes: title 22–26, text 14, label 12. The lede stays 14/20: at 15 it
  would wrap at 320 px (301 px in a 288 px column), which signin-lede.spec forbids.
- **A wrong code is said on its field**: `CodeField` takes `invalid`; the input is `aria-invalid` and described by the
  error, so the field's rose border is the address's; the digits are selected, so typing replaces them; typing clears
  it. Optional, so the personal space's unlock keeps its behaviour.
- **«Check your email» in two lines**: «We sent a link and a code to <address>.» (text) and, as the note, «Open the
  link in this browser, or type the code here.» Both sentences live in `auth-words.ts`.
- Nothing else moves: the light, the title, the buttons and every state's words otherwise.

## Checks

- `e2e/signin-hierarchy.spec.ts`: the note at 12/16 under a 14/20 lede, three sizes at most; sent, the main line at
  most two lines at 390 and the note one; a wrong code marks the field rose (as an address does), selects the digits,
  and typing clears it. Dark and light.
- `auth-words.test.ts` for the two sentences. `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`,
  `tsc --noEmit -p apps/studio`; the sign-in specs through the guard.
