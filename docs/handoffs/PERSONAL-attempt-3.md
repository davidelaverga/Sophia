# Implementation-session handoff

Goal and attempt: the "$20" pass on the Personal space, attempt 3 (#88: the opening's check on CI)  
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine  
Native session: a local Claude Code session; its identity is unknown (not exported)  
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/pass` at `7c5df3e`, 2026-10-04  
Ending commit/tree and changed files: content commit `7210f16` (tree `c26bc15c38cb`); these files changed:
- `apps/studio/src/app/entry.ts`
- `apps/studio/e2e/opening.spec.ts`

## Outcome

**What was wrong:** CI failed #85's opening check again, with a step that read for 305 ms. The cause is in the product. Each step's time to be read (480 ms) counted from asking for the change, but its words land after a 140 ms fade, and a loaded page stretches that fade.

**What a person sees now:** each step's words stay at least 480 ms from when they appear.

**What changed in the check:** it records each change of words as it happens (a `MutationObserver`), not at the next sampled frame.

## Evidence

**Commands** (via `<scratchpad>/pw-low.ps1`, at below-normal priority on half the workers):
- `pw-low.ps1 e2e/opening.spec.ts --repeat-each=3`: 30 of 30 passed.
- **A temporary check (not committed)** ran the opening under `Emulation.setCPUThrottlingRate 6`, 3 runs. The steps lasted 1412–1435, 897–930 and 649–651 ms.

**From the repo root:** `pnpm format:check`, `pnpm lint` and `pnpm typecheck` pass.

**Source-register IDs consulted:** none.

## Decisions and changes

`say(p, words, landed)` calls `landed` once the words are in place. `pace` sets `saidAt` there, and only then paces the next step.

This touches #85's opening inside #88. It fixes the check that #88's CI fails on, and it stays separate in its own commit.

## Remaining obligations

The same as attempt 2.

## Next bounded action

Luis reviews #88 and gives the merge OK once CI is green and Codex has no P1.
