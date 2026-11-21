# Handoff: one motion vocabulary, attempt 2

Goal and attempt: MOTION-TOKENS (informe-30 §2.6), attempt 2: the review's P2 and P3s on attempt 1
(`MOTION-TOKENS-attempt-1.md`, head `b0c4119da`; its e2e ran via pw-direct, 186 passed; review found no P1).
Executor: Claude Code subagent in worktree `D:\Descargas\SophiaV4\Sophia-paper-4`, branch `kit/motion-tokens`; not
pushed, no PR. Scope as attempt 1.
Commits: `46029241a` (fence fixtures, red), `a87247365` (checker + values, green), then this record.

## Outcome

- **P2, the rename is guarded:** a duration slot (a shorthand's first time-like word: a literal, a `calc()`, or any
  `var()` that is not an easing token; every item of a `-duration` longhand) takes only zero or a bare
  `var(--motion-…)` that `:root` declares. `transition: color var(--fast) var(--ease)` now fails, where it passed
  while the transition snapped to 0 s. The third subtest checks every `var()` read inside any transition or animation
  value: `--motion-*` / `--ease*` must be in `:root`; any other (`--d`, `--i`, `--lane-delay`) must be declared by a
  sheet or set by Studio code.
- **P3a:** `var(--motion-fast, 999ms)`, `calc(300ms)` and a local `var(--dur)` in the duration slot are flagged.
- **P3b:** `linear(...)` is flagged as an easing; plain `linear` stays allowed.
- **P3c:** `hw-draw` 700 ms, `buddy-hello-left/right` and `ultra-sweep` 1.6 s, `meter-fill` 0.8 s and the `.umbral`
  filter 1 s are back at their old values and on the list with reasons (27 entries). Migrated items: 93. Largest
  shift now 50 ms (0.45 s → 0.4 s, −11 %); every other is 40 ms or less. `docs/plans/motion-tokens.md` mapping,
  list and fence rules updated.

## Evidence

- **Red** `46029241a`: fixture subtests «a token it does not know, a fallback, a calc or a local property…» and «a
  linear() curve…» failed under attempt 1's checker, and «every listed exception is still written» failed (the six
  entries listed at their old values before the CSS went back). 3 pass, 3 fail.
- **Green** `a87247365`: motion.test.ts 9/9 (with two `undeclaredReads` fixtures: `var(--fast)` →
  `['--fast']`; `--motion-quick`, `--ease-out` caught, `--d` not); with css-motion, states and elevation 23/23.
- Probe: appending `.probe { transition: color var(--fast) var(--ease); }` to explore.css failed subtests 1 and 3,
  naming the item; the file was then restored with `git checkout`.
- All Studio units: 2469 tests, 2467 pass; the 2 failures are the known Windows-only `attention.test.ts` and
  `browser-imports.test.ts`.
- `pnpm -s lint` 0, `pnpm -s typecheck` 0, Prettier clean.
- **E2E** through `pw-gentle.ps1` at `a87247365` (log `b19-motion-tokens-2`): `resources`,
  `resource-control-status`, `light-material`, `home`, `light-breath`: **186 passed** (10.0 min, after waiting
  164 s for its turn).

## Open

- Local branches that still write `var(--fast)` / `var(--base)` (conversations/find, conversations/thread) will now
  fail the fence on rebase: rename to `--motion-fast` / `--motion-base`.
