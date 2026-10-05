# Implementation-session handoff

Goal and attempt: words handed from Home wait, never lost (`docs/plans/personal-handed-wait.md`), attempt 1  
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine  
Native session: a local Claude Code session; its identity is unknown (not exported)  
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/handed-wait` from `personal/codex-p2` (#95), 2026-10-04  
Ending commit/tree and changed files: content commit `251ae80` (tree `c3d810387a71`); these files changed:
- `apps/studio/src/features/personal/PersonalComposer.tsx` (`useHanded`);
- tests and fixture: `apps/studio/e2e/personal.spec.ts`, `apps/studio/fixtures/personal.tsx` (`handed=words`);
- `docs/plans/personal-handed-wait.md`.

## Outcome

**The bug (found by #95's review, and older than this work):** words said to Sophia from Home were lost if another tab's message was on its way when they arrived. The field stayed empty under "send this one after it".

**Now:**
- They wait in the field, after anything written there, with the line saying why.
- When nothing else is sending, they go at once, as before.
- A composer that went meanwhile (signing out, an erasure) takes nothing back.

**The independent review found no P1 and no P2.** Its P3s are fixed:
- the guard against writing after the composer is gone;
- an accurate comment (this tab's own message makes them wait to go, not go into the field);
- a clearer name;
- a check that the words written earlier come first.

## Evidence

**Commands** (browser checks through `D:\Descargas\SophiaV4\.claude-guards\pw-safe.ps1`):
- **Tests first:** the "another tab sending" check failed before the change (an empty field). The "go at once" check is a guard.
- **Handed checks:** `pw-safe.ps1 e2e/personal.spec.ts -g handed --repeat-each=3`: 9 of 9 passed.
- **Full suite:** `pw-safe.ps1`: 359 of 359 passed.
- **Mutations** (`<scratchpad>/mutate-handed-final.py`, using Git's bash and the guards): 5 product mutants killed, and the control survives:
  - lost;
  - kept even when sent;
  - kept without why;
  - order swapped;
  - typed words dropped.

**From the repo root:** `pnpm format:check`, `lint`, `typecheck` and the Studio's build pass.

**Source-register IDs consulted:** none.

## Remaining obligations

**This is the top of a stack: #91 ← #92 ← #93 ← #94 ← #95 ← this.** Merge in order, and retarget each PR to `main` before deleting its base.

**Older edge cases, left as noted in the plan:**
- Words handed while the space's epoch is still unknown are shown but not kept, and the device's first read can replace them.
- When a send fails before its admission is decided, the line says another message is on its way. The words are safe in the field.

## Next bounded action

Luis reviews the stack.
