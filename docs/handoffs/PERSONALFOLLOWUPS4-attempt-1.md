# Implementation-session handoff

Goal and attempt: the last open follow-ups (`docs/plans/personal-follow-ups-4.md`), attempt 1  
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine  
Native session: a local Claude Code session; its identity is unknown (not exported)  
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/follow-ups-4` from `personal/follow-ups-3` (#98, merged as `15a78ba`), 2026-10-05  
Ending commit/tree and changed files: the content commit before this handoff. These files changed:
- new in `apps/studio/src/features/personal/`: `characters.ts` and its test, `useCapped.ts`;
- changed in the same folder: `PersonalComposer.tsx`, `PersonalSpace.tsx`, `Conversation.tsx`, `Memory.tsx`, `WorkSpace.tsx`, `conversation-view.ts` and its test;
- `apps/studio/fixtures/personal.tsx` (`longReply`, the epoch as Places knows it);
- `apps/studio/e2e/personal.spec.ts`;
- `docs/plans/personal-follow-ups-4.md`.

## Outcome

**Limits in characters.** Notes (90), a corrected memory (140) and a project's title (180) are held to their most characters as the API counts, through `useCapped` (on `capped` and `clip`).
- A change that would pass the most keeps what was there and as much of what was put in as fits. Deletions are always taken.
- While an input method composes it is left alone, and its words are then held against the value the composition began from.
- The note's prefill cuts in characters.

**Words handed from Home** aren't taken before the space's epoch is known. Until then the field's line says "From Home, waiting for your space · …".

**A reply of hers that came while Personal was out of sight** waits below on return, with "Sophia answered", where the conversation overflows. Before, it jumped to the end 8 of 20 runs. Where the conversation fits, there is no line.

**Independent reviews: no P1.** Their P2s are fixed:
- cutting on every change lost text;
- words handed from Home were invisible;
- a composition ending cut existing text;
- a stuck line where the conversation fits.

## Evidence

**Commands** (browser checks through `D:\Descargas\SophiaV4\.claude-guards\pw-safe.ps1`):
- **Tests first.**
- **The return case:** measured 20 at a time. The old code failed 8 of 20; now 20 of 20.
- **Personal:** `--repeat-each=2`, 190 of 190 before the last check was added; that check then passed 6 of 6.
- **Full suite:** 419 of 424. The failures are the report specs that fail on `main` on this Windows machine.
- **Units:** Personal's, 113 of 113.
- **Mutations:** the product mutants killed, and the controls survive:
  - `lengthOf`, `capped` (paste and growth), the note's prefill, the note field, words handed before the epoch, the waiting line, the line where the conversation fits;
  - the two return-case mutants, 20 runs each.
  - Clearing "at the end" while away was found unnecessary by its mutant (20 of 20 without it), so it was taken out.

**From the repo root:** `pnpm format:check`, `lint`, `typecheck` and the Studio's build pass.

**Source-register IDs consulted:** none.

## Remaining obligations

- **This PR's merge:** on green CI with no Codex P1.
- **The Work composer's long words:** after Davide's #76.
- **#96's competing draft writes:** the design change in `personal-follow-ups-3.md`.
- **`CalendarTab`'s session title:** still uses `maxLength` (UTF-16 units).

## Next bounded action

The room's survey (Luis, 2026-10-05).
