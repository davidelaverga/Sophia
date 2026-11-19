# Handoff: fixed waits in the Studio's e2e suite

Goal and attempt: E2E-FIXED-WAITS (replace `page.waitForTimeout` in `apps/studio/e2e` with waits on conditions; fence
the count), attempt 1
Executor: Claude Code session in worktree `Sophia-paper-5`
Starting commit: branch `ci/e2e-fixed-waits` from `origin/main` `c9c226c94`; not pushed
Writable scope: `apps/studio/e2e`, `apps/studio/src/app` (the fence), this record. No app code, no fixtures.

## Outcome

- Fence `apps/studio/src/app/e2e-fixed-waits.test.ts` (node:test, runs in `pnpm test`): every `waitForTimeout(` in
  `apps/studio/e2e/**/*.ts` must have `// Fixed wait kept: <why>` on the line above. Committed first; it failed with
  **215** unexplained waits.
- **6 replaced** by conditions:
  - `toast-over-sheet.spec.ts` (5): `waitForTimeout(400)` → `rested(page)`, an `expect.poll` until no finite animation
    still runs in `.toast`, `.sheet` or `[role="dialog"]` (the notice's 8 px rise and the sheet's entrance both end
    before the geometry is read; the file's own `frame()` already waited this way).
  - `home.spec.ts` (1): shown again, her frames are polled until they pass ten, instead of read once after 500 ms.
- **209 kept**, each with its reason on the line above. By kind:
  - Negative checks, about 180: nothing may be sent, read, joined, acknowledged, notified or shown within a window
    («a join let through would have asked for its token by now», «no automatic retry», «the late answer changes
    nothing»). Nothing in the page marks an absence, so a condition would pass at once and prove nothing.
  - Timers the page cannot observe, about 15: the fixtures' 3 s late answers (`mission-writes.ts`), TanStack's retry
    waits, the feed's debounced snapshot read in its held case, the erasure event learned before the next read.
  - The time is the subject, about 14: backoff steps under a modal (mentions), sampling spacings (voice meters, orb
    eases, `reliability/`), a simulated slow runner (`room-basics`), the documented frame floor (`frames.ts`), and a
    manual poll interval that collects rather than throws (`press-answers`).
  - Settles with no shared marker: `type-rem-fit`'s `settle` (14 pages × 2 roots × 2 sizes), `spaces-honest` and
    `knowledge-honest` (what sits under or beside the demo label must have drawn).
- The fence passes at 0. The allowance is 0: a new fixed wait needs its reason written above it.

## Why so few replacements

The suite's fixed waits grew mostly as negative checks: after a refusal, a lost reply or a drop, the check is that
nothing else happens. A web-first assertion can't wait for nothing. Two ways would cut the time without weakening
those checks, and both are bigger than this attempt:

1. `page.clock` with `runFor` in place of the long negative windows (made-refusal 9 s, feed-recovery 8 s,
   project-conversation-writes 12 + 6 s, room-alive 6 s, room-return 5 s, mentions 4.5 s ×2, conversation-moves
   4.5 s, the 3.5 s ones). `runFor` awaits between timers, but a faked response whose body is read through real tasks
   can finish after the clock has already gone past a retry it would have scheduled. The check would then pass
   without proving anything. Each case needs its own proof that it still fails when the bug is put back.
2. A quiet marker in the fixtures (e.g. `window.fixture.pending()`: no held read, no timer of the fixture's still due)
   would let the «late answer changes nothing» checks wait for the answer to land rather than a fixed 500–1500 ms.

## Verification

- `node --test apps/studio/src/app/e2e-fixed-waits.test.ts`: fails with 215 at the fence commit, passes after.
- The 56 comment-only spec files: `git diff -U0` shows no added or removed line other than `// Fixed wait kept:`
  comments, so their behaviour is unchanged.
- Playwright through the guard (`pw-gentle.ps1`, one worker): see the results section below.
- `pnpm -s lint` and `pnpm -s typecheck` (whole repo) exit 0; Prettier clean on touched files.

## Results through the guard

| Ref | Specs | Result | Wall time |
| --- | --- | --- | --- |
| `c9c226c94` (base) | `toast-over-sheet`, `home` | 36 passed | 43.3 s |
| `e08fc1ac4` | the same, `--repeat-each 3` | 108 passed, none flaky | 2.2 min (about 44 s a pass) |

The line reporter prints no per-test durations. The six waits replaced added up to 2.5 s across one pass, which is
inside the run-to-run noise of a one-worker run. Other agents shared the machine, and this one waited 556 s and 68 s
for its turns. The comment-only files were not run: their diff is comments only.
