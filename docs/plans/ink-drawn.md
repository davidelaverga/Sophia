# Contrast and type checks: one list of what each page shows once drawn

> 2026-10-09 · Luis: «Continua». Left from #191: `ink.spec.ts` still waited for the network to be idle, the wait that
> timed out on CI for the type scale check. No change to the Studio.

## What changes

- What each fixture page shows once it has drawn moves to one place, `e2e/drawn.ts` (`DRAWN`, `drawn()`): a part for
  each read that fills the page, the last of a chain included. `type-scale.spec.ts` uses it as before; `ink.spec.ts`
  now does too, and gains Home's and the personal space's parts (Work's index and «You and Sophia»; the thread and its
  notes). Home's greeting is not one: it changes with the hour.
- Knowledge's covers draw only once in reach: on a wide screen the cards with written covers are, so the check waits
  for one of those (its words are measured); on a phone only the first card is (a designed page), so it waits for
  that one.
- No spec in the Studio waits for `networkidle` any more.

## Checks

- `ink` (five pages, desktop and phone) and `type-scale`, `--repeat-each=2` under the machine's guard: all pass. A
  part that never draws fails on that part, never on a network timeout (seen when the phone waited for a written cover
  out of reach).
