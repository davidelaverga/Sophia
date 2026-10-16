# The same question: four words read right, the question read once

> 2026-10-16 · The four P2s left on #274 (`evaluacion-2026-10-13/follow-ups-p2.md`). They are all in
> `new-conversation.ts`, which tells a member when a conversation here already asks their question. Studio only.

## What changes

- **Large spelled numbers stay exact.** `valueOfRun` counts in `BigInt`. «nine million million million and nine» is
  9000000000000000009, not a float rounded to 9000000000000000000, so it meets the figure written out.
- **A spelled negative is signed like a figure.** «minus five» and «minus 5» read as `minus5`, the same as «-5». So
  «-5 percent» and «minus five percent» are one question, and «5 percent» is another.
- **«let's» is «let us».** It is expanded before the possessive rule drops `'s`, so «Let's not enable…» and «Let us
  not enable…» compare word for word.
- **The question is read once per draft.** `readTitle` folds a title and reads its words, its negation, its prefixes,
  its turns and its ordered words once. `sameQuestion` reads the question once, not once per conversation compared.

## Checks

`new-conversation.test.ts`:

- a long spelled number meets its exact figure;
- «minus five percent» meets «-5 percent» and not «5 percent»;
- «Let's not …» meets «Let us not …»;
- the question is folded the same number of times against one conversation as against twenty.
