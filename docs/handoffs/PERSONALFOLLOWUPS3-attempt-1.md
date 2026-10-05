# Implementation-session handoff

Goal and attempt: Codex's open follow-ups on #91, #96 and #97 (`docs/plans/personal-follow-ups-3.md`), attempt 1  
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine  
Native session: a local Claude Code session; its identity is unknown (not exported)  
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/follow-ups-3` from `personal/small-p2` (#97, merged as `a41132e`), 2026-10-05  
Ending commit/tree and changed files: the content commit before this handoff. These files changed:
- in `apps/studio/src/features/personal/`: `PersonalComposer.tsx`, `PersonalSpace.tsx`, `Find.tsx`, `Conversation.tsx`, `usePersonal.ts`, and the new `shared-read.ts`;
- `apps/studio/fixtures/personal.tsx`;
- `apps/studio/e2e/personal.spec.ts`;
- `docs/plans/personal-follow-ups-3.md`.

## Outcome

- **#97, trimmed length:** 4,000 letters followed by spaces go through. The count, Send and the send all measure the trimmed words, as the server checks them.
- **#97, shared read:** earlier days are read once at a time, and everyone sees it (`useSharedRead`): the days' menu and Find both say "Reading…" and wait. Find holds the match it is on as earlier days come in from anywhere, and holds it again if that match changes.
- **#91, latest exchange:** a conversation that fits and then starts to overflow (a shorter window, a rotation) keeps a reader who was at its end there. A `ResizeObserver` on the list scrolls at once, not smoothly.
- **#96, competing draft writes: not fixed, written down.** A compare-and-swap with a re-read before the write was built and then taken out, after the independent review showed it can't see another tab's write in a real browser. localStorage has no atomicity across tabs. The real fix is a change of design, set out in the plan, for Davide and Luis.

**The independent review found no P1.** Its P2 (the compare-and-swap did nothing) was resolved by taking it out and documenting the limit. Its P3s are fixed: the held match re-held, the instant scroll, and the latest read kept in a layout effect.

## Evidence

**Commands** (browser checks through `D:\Descargas\SophiaV4\.claude-guards\pw-safe.ps1`):
- **Tests first:** the three browser checks failed before the change.
- **Personal:** `--repeat-each=2`, 179 of 180. The one failure was a page-load timeout; repeated alone, it passed 5 of 5.
- **Full suite:** 413 of 418. The failures are `report-page.spec.ts` and one `report-reading.spec.ts` check, which fail the same way on `main` on this Windows machine.
- **Units:** Personal's, 110 of 110.
- **Mutations** (`<scratchpad>/mutate-fu3b.py`): 4 product mutants killed, and the control survives:
  - raw length;
  - menu "Reading…" unsaid;
  - no pin on resize;
  - match not held.
  - An earlier run killed "match not held" and "no pin" too. "Not shared" survives: both buttons already refuse a second press while reading, so sharing the read in flight is defensive.

**From the repo root:** `pnpm format:check`, `lint`, `typecheck` and the Studio's build pass.

**Source-register IDs consulted:** none.

## Remaining obligations

- **This PR awaits Luis's merge OK.**
- **#96's competing writes:** the design change described in the plan.
- **Still open, older:**
  - an unseen reply when coming back to Personal;
  - words handed while the epoch is unknown;
  - the notes, memory and Work fields' limits in UTF-16 units;
  - the Work composer's long-word bug, after #76.

## Next bounded action

Luis reviews the PR.
