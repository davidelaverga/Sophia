# People's empty sentence starts where the panel's tabs do

> 2026-11-27 · Luis: «Sigue con la cola de mejoras de UI». P3-11 of the independent evaluation
> (`evaluacion-2026-11-22/evaluacion-independiente.md`), not among the 29 improvements. Studio only; no new words.

## Seen (fixture, 1280 × 800, main 4e2ba1cbc)

Before anyone is in the call, People says «Who’s in the call shows once you join.» (or «Nobody is in the call yet.»).
The sentence is an `EmptyState` put straight in `.side-panel-body`, whose `.empty` has no inline padding: its words
began at x 901, 1 px from the panel's edge (900), while the tabs' words begin at 917 and the people rows at the same
16 px (`--panel-pad`).

## Change

- `.side-panel-body > .empty { padding-inline: var(--panel-pad) }` (theme.css). Only an empty state that is the
  panel's own child takes it: Chat's and Brief's sit inside their own padded blocks.

| Measure (fixture)          | Before         | After          |
| -------------------------- | -------------- | -------------- |
| 1280 × 800, words / tabs x | 901 / 917      | 917 / 917      |
| 390 × 844 (sheet), words x | 0              | 16             |

## Checks

- E2E: `panel-empty-edge.spec.ts` (the sentence's words start within 1 px of the first tab's). Seen failing on main
  (16 px apart). CI is the record (the Playwright guard refuses while Opera is open).
