# Implementation-session handoff

Goal and attempt: Codex's review of the Personal stack (#92–#96), fixed before merging, attempt 1  
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine  
Native session: a local Claude Code session; its identity is unknown (not exported)  
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, the stack as pushed after #91 merged (main `599178d`), 2026-10-04  
Ending commit/tree and changed files:
- **Each fix sits on the branch that introduced the problem,** then was merged up through the stack: `personal/touch` (#92), `personal/ease` (#94), `personal/codex-p2` (#95), `personal/handed-wait` (#96, this branch).
- **Files changed:** `Conversation.tsx`, `PersonalComposer.tsx`, `PersonalSpace.tsx`, `Find.tsx`, `note-flight.ts` and `personal.css` in `apps/studio/src/features/personal/`; plus `apps/studio/e2e/personal.spec.ts` and `apps/studio/fixtures/personal.tsx` (`heard=`, `handedAfter=`).

## Outcome

**Luis gave the OK to merge.** #91 merged (green, no P1). The merge rule held the rest: Codex had found P1s and CI was red.

**Codex's P1s, fixed:**
- **#92:** a copy that settles once Personal is out of sight is taken back off the clipboard, as far as the browser lets a page write then.
- **#94:**
  - a microphone listening keeps its Stop when the browser goes offline;
  - offline, a way in adds its words after the draft, never over it.
- **#95:** the admission's promise no longer uses `Promise.withResolvers`, which Safari 16.4 lacks.

**Codex's P2s, fixed too:**
- **#92:**
  - no note flight out of sight;
  - words past 4,000 (heard or handed) are counted as they are, "N over", and Send and Enter refuse them.
- **#94:** Find pressed while the notes cover the conversation puts them away and opens.
- **#96:** handed words longer than one message wait in the field, said too long, offline and loading included.

**CI's red** was a flaky phone check, "she didn't pull you down". It now compares with where you read, not a fixed 10 px. The list moves about 19 px when her reply lands, far from being pulled to it.

**Three independent reviews** of this round found no P1. Their P2s, now fixed:
- the offline note that stayed after reconnecting;
- Find looking pressable under the notes with no visible or spoken reason;
- long handed words given a false line.

Their useful P3s are fixed too:
- one length rule;
- thousands in "over";
- the focus on opening in a layout effect;
- docs on the right functions;
- a check that can't pass vacuously.

## Evidence

**Commands** (browser checks through `D:\Descargas\SophiaV4\.claude-guards\pw-safe.ps1`):
- **Tests first:** each fix's check failed before it.
- **Full suite** on the top of the stack: 367 of 368. The one failure was a Resources check this work doesn't touch; repeated alone it passed 4 of 4. Earlier full runs this round: 368 of 368.
- **Lint and typecheck:** clean on every branch of the stack.
- **Units:** Personal's, 109 of 109.
- **Mutations** (`<scratchpad>/mutate-92fix.py`, `mutate-94fix*.py`, `mutate-95fix.py`, `mutate-96fix*.py`, using Git's bash and the guards): every product mutant killed, and every control survives.

**Source-register IDs consulted:** none.

## Remaining obligations

**Merge order:** #92 → #93 → #94 → #95 → #96, each with green CI and no Codex P1. Retarget the next PR to `main` before deleting each base.

**Left as P3:**
- Copy's take-back can be refused by a browser once the press's gesture is gone.
- A dictation start still waiting for its language when the browser goes offline shows its Stop only once it listens.
- Long handed words wait for a send under way before they show.
- **Older follow-ups:**
  - #91's P2: keep the latest exchange pinned as the list begins to overflow;
  - the Work composer's long-word bug, after #76.

## Next bounded action

Push the stack, watch CI and Codex, and merge in order on green.
