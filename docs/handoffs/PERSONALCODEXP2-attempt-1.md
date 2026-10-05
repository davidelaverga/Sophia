# Implementation-session handoff

Goal and attempt: Codex's P2s on #89 and #90 (`docs/plans/personal-codex-p2.md`), attempt 1  
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine  
Native session: a local Claude Code session; its identity is unknown (not exported)  
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/codex-p2` from `personal/ease` (#94), 2026-10-04  
Ending commit/tree and changed files: content commit `1ac210a` (tree `b8dd8c810d24`); these files changed:
- `apps/studio/src/features/personal/`: `PersonalComposer.tsx`, `PersonalSpace.tsx`, `Conversation.tsx`, `WeekLook.tsx`, `personal.css`;
- `apps/studio/e2e/personal.spec.ts`;
- `docs/plans/personal-codex-p2.md`.

## Outcome

**1. #89, the week waits for cross-tab admission.**
- The field's send now resolves once it is known whether the words went on their way. That is when this tab holds the device's send (`oneAtATime`), or not.
- "Talk about it" puts the week away only then. Offline, it goes once its words wait in the field.
- The ways in wait on the same answer.

**2. #89, one microphone at a time.** A talk running over the field counts as out of sight for it, so its dictation stops before the talk's voice starts. Words heard so far stay in the field.

**3. #90, contrast in every state.** All of these are now on `--text-sec` or brighter, measured at 4.5:1 or more:
- "No notes yet…" was 3.79:1;
- the talk's status line;
- the talk's earlier lines (0.5 → 0.72 opacity, from 3.70:1);
- from the review: the field's note line ("offline", "a wait", "a draft kept", 3.79:1) and the places' quiet words (the days' menu topics, 3.88:1; the data sheet's labels).

The contrast check now opens:
- the empty notes;
- a talk, measured where it is drawn, its status the moment it speaks;
- the days' menu;
- the offline line.

**The independent review found no P1.** Its P2s on contrast are fixed. Its P3s:
- **Fixed:**
  - the admission settles even when the send fails before deciding;
  - the comments are merged and accurate;
  - the cross-tab test waits for the lock to be granted and released, and for the wait to be said.
- **Not changed:** the double press on "Talk about it". It couldn't be reproduced, because the week goes at admission before a second click lands. A guard for it couldn't be shown by any check, so it was left out.

## Evidence

**Commands** (browser checks through `D:\Descargas\SophiaV4\.claude-guards\pw-safe.ps1`):
- **Tests first:** the three P2 checks and the review's contrast states failed before their changes.
- **Personal:** `pw-safe.ps1 e2e/personal.spec.ts --repeat-each=2`: 136 of 136 before the review's fixes. After them, the spec passed once more, in the full suite below.
- **Full suite:** `pw-safe.ps1`: 356 of 356 passed.
- **Units:** Personal's, 109 of 109.
- **Mutations** (`<scratchpad>/mutate-codex-final.py` and its reruns, using Git's bash and the guards): 8 product mutants killed, and the control survives:
  - admitted anyway;
  - week goes anyway;
  - dictation under the talk;
  - empty notes, talk status, earlier lines, note line and days' menu, each set back to faint.

**From the repo root:** `pnpm format:check`, `lint`, `typecheck` and the Studio's build pass.

**Source-register IDs consulted:** none.

## Remaining obligations

**This is the top of a stack: #91 ← #92 ← #93 ← #94 ← this.** Merge in order, and retarget each PR to `main` before deleting its base.

**Found by the review, older than this work, and left for Luis to decide:** words handed from Home to be sent are lost if the send has to wait (another tab's message on its way). `useHanded` sends them without putting them in the field when they can't go. Now that send says whether it went, the fix is small. Ask Luis before opening an issue or a PR.

## Next bounded action

Luis reviews the stack.
