# Finding a token's head without rescanning the text

> 2026-11-16 · The P2 of the integration review of #513 (`evaluacion-2026-11-16/revision-513.md`). Luis: «Debemos
> poder ir avanzando en otra cosa».

## What was measured

- **Where:** `packages/coordination/src/intake-observation.ts`. A declared import (`quotedText`,
  `attachmentInstruction`) is removed only as a complete span (r17 F01, `importSpans` in the policy): the rest of its
  token on each side must be punctuation. `importOccurrences` reads that rest with `tokenHead(text, at)` and
  `tokenTail(text, end)` once per occurrence.
- **The head is quadratic.** `TOKEN_HEAD = /[^\s–—―⸺⸻]*$/u` has no left anchor and runs on
  `text.slice(0, at)`. Where a long run of non-separators ends before a separator, every start in the run consumes it
  to the separator and fails at `$`: work quadratic in the run, once per occurrence.
- **Checked on this branch (Node 24.21.0):** `observeIntake` with `quotedText: 'a'` on `'x'.repeat(n)` followed by
  `' a'` 500 times took 314 ms at n = 1 000, 1 304 ms at 2 000 and 2 456 ms at 3 000 (4 000 characters, the input
  limit `INTAKE_LIMITS.textChars`). The review's 8 000-character figures exceed that limit, so they apply to the regex
  alone, not to `observeIntake`.
- **The tail is linear.** `TOKEN_TAIL` is anchored at `^`, so it is tried at the start of `text.slice(end)` only.
- **Who calls it:** today only `scripts/intake-observe.ts`. The plan has the future intake consumer reuse this module
  in the API, where seconds of work would block the event loop.

## What changes

- **`tokenHead` walks back from `at`** while the unit before it is not a separator, then returns the slice. The
  separator set is the same class, kept beside `TOKEN_TAIL`: whitespace as `\s` reads it, and U+2013, U+2014, U+2015,
  U+2E3A, U+2E3B. Work is the head's length.
- **Exactly the same string for every input.** Every separator is one BMP code unit and no surrogate half is one, so a
  surrogate pair, astral letter or lone surrogate is never a separator, whether read as a code point (`u`) or as a unit.
  The old match therefore always started just after the last separator before `at`, which is where the walk stops.
- **Nothing else moves:** `TOKEN_TAIL`, `SPAN_EDGE`, the outcome of every observation, the policy, its version
  (`sophia.intake-observation.policy.v25`) and its digest, and the CLI report schema.

## Tests (written first)

- **Equivalence:** the new `tokenHead` equals the old regex at every `at` of a table of tricky inputs (empty, all
  separators, astral letters, lone surrogates, dashes, mixed Unicode spaces, zero-width characters that `\s` does not
  read) and of 300 deterministic pseudo-random strings over an alphabet holding those.
- **Bound:** `observeIntake` on 4 000 characters shaped as above, and with the run after the occurrences instead,
  finishes within 200 ms. Red on the current code with its measured time.
