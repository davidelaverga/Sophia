# Implementation-session handoff

Goal and attempt: INTAKE-TOKEN-SCAN (the P2 of the integration review of #513,
`evaluacion-2026-11-16/revision-513.md`: `TOKEN_HEAD` has no left anchor and runs once per import occurrence, so a long
word before a separator costs quadratic work per occurrence; Luis 2026-11-16: «Debemos poder ir avanzando en otra
cosa»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `coordination/intake-token-scan` from
`origin/main` `9495c87fc` (everything through #513 and #501 merged; not pushed)
Writable scope: `packages/coordination/src/intake-observation.ts` and its test, `docs/plans`, `docs/handoffs`; no copy,
no policy or report change.
Runtime unit: Luis's Windows host; CI as the run on record.
Existing authority: Luis, the quote above; local only, nothing pushed.
Ending commit/tree: `df23b44d3`, the last commit that changes a test or the note (the review's P3s); the next one adds
only this record's update. Files changed against `9495c87fc`: `packages/coordination/src/intake-observation.ts` and its
test, `docs/plans/intake-token-scan.md` (new), and this record.

## After the independent review (no P1/P2; its P3s)

- **The review verified the equivalence over every BMP unit.**
- **`df23b44d3`**: the bound test observes a short message first, so module warm-up isn't in the 200 ms budget. It is
  still red on the old code (`observed 4000 characters with 500 imports in 1794 ms`) and green on the fix (about
  1 ms). The design note gains «Limits»: `importOccurrences` stays O(token length) per occurrence, about 57–81 ms per
  declared import for one 4 000-character token with an occurrence at every offset (about 160 ms with both imports),
  bounded by `INTAKE_LIMITS.textChars`. It would become linear by remembering the previous token's start, later, if the
  API needs it.
- **Green:** `intake-observation.test.ts` 201/201; whole-repo `oxlint --type-aware` exit 0; `tsc` for coordination
  exit 0; Prettier clean.

## Outcome

- **`tokenHead` walks back** from the occurrence to the last separator (`SEPARATOR`: whitespace as `\s` reads it, and
  U+2013, U+2014, U+2015, U+2E3A, U+2E3B), instead of an unanchored `[^…]*$` over everything before it. Work is the
  head's length.
- **Same string for every input.** Every separator is one BMP unit and no surrogate half is one, so walking units gives
  what the `u` regex gave; the equivalence tests check it, astral letters and lone surrogates included.
- **`TOKEN_TAIL` is unchanged**: anchored at `^`, it is tried at one position only.
- **Unchanged:** every observation, `sophia.intake-observation.policy.v25` and its digest, the CLI report schema.
  `tokenHead` is now exported, for the equivalence test only.

## Evidence

- **Claim checked:** the review's 8 000-character figures exceed the input limit (`INTAKE_LIMITS.textChars`, 4 000), so
  they apply to the regex alone. Through `observeIntake` with `quotedText: 'a'`, `'x'.repeat(n)` then `' a'` ×500 took
  314 ms (n = 1 000), 1 304 ms (2 000) and 2 456 ms (3 000, 4 000 characters) before; 3 ms, 0 ms and 0 ms after.
- **Written first and failing** (`a46b561ef`): `AssertionError: observed 4000 characters with 500 imports in 2524 ms`
  (1 823 ms on a rerun) against the 200 ms bound; both equivalence tests passed on the old code, as a characterization
  should.
- **The equivalence tests fail when they should** (control mutants, not committed): dropping U+2E3B from `SEPARATOR`,
  narrowing `\s` to space/tab/newline, adding U+200B, and reading `charAt(start - 2)` each fail both; only an
  equivalent mutant survived.
- **Green** (`bdbe37456`): `intake-observation.test.ts` 201/201, the new bound in about 4 ms. An occurrence inside
  one 4 000-character token (`'xa'.repeat(2000)`) takes 36 ms: the walk is then the token's length per occurrence,
  bounded by the input limit, as `SPAN_EDGE` already was.
- **The rest is as on the base:** `scripts/intake-observe.test.ts` 62/119 and `packages/coordination/src/*.test.ts`
  417/633 here, 62/119 and 414/630 on `9495c87fc`, the same failing tests. They fail on Windows only: the written CLI
  and the runner journal need `O_NOFOLLOW` and `getuid` (`runner-journal.ts`, POSIX only), so CI is the run on record.
- Whole-repo `oxlint --type-aware` exit 0; `tsc --noEmit` for `packages/coordination` and `apps/studio` exit 0;
  Prettier clean on both files.

## Decisions and changes

- **Walked by unit, not by code point**: equal by the reason above, and simpler. The comment on `tokenHead` says why.
- **The bound test uses 4 000 characters**, the input limit, not the 8 000 the task suggested: `observeIntake` refuses
  more. Both shapes are timed: the long run before the occurrences (the quadratic one) and after them (the tail).
- **The old regex lives in the test as the oracle**, so the equivalence is checked against the exact r17 head.

## Remaining obligations

- Not pushed; CI is the run on record (the CLI and journal suites need POSIX).
