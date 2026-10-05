# Implementation-session handoff

Goal and attempt: Personal's ease pass, §3 of `docs/plans/personal-moments.md`, attempt 1  
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine  
Native session: a local Claude Code session; its identity is unknown (not exported)  
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/ease` from `personal/moments` (#93), 2026-10-04  
Ending commit/tree and changed files: content commit `6cfbcd4` (tree `bd226a9451da`); these files changed:
- new in `apps/studio/src/features/personal/`: `Find.tsx`, `find-view.ts` and its test, `online.ts`;
- changed in the same folder: `Conversation.tsx`, `PersonalComposer.tsx`, `PersonalSpace.tsx`, `personal.css`;
- tests and fixture: `apps/studio/e2e/personal.spec.ts`, `apps/studio/fixtures/personal.tsx` (`earlier=1`);
- `docs/plans/personal-moments.md` (§3 aligned with what was built).

## Outcome

**Find in your conversation:**
- **Opening it:** Ctrl or ⌘ F while Personal is in sight (through the Studio's shortcuts), or "Find" in the head. Anywhere else, including in a talk or behind the padlock, the browser keeps its own find.
- **Results:** the turns mark what matches, whatever its case. The current match is in her light and in sight, with "2 of 5" or "No match". Enter and Shift Enter step through, round at either end.
- **Closing:** Esc closes it wherever its focus is, clears the marks and gives the focus back.
- **Earlier days:** "Look further back" reads them, keeps the match you were on, and keeps the focus in the finder.
- **On a phone,** the words take the line's whole width.
- **Leaving:** out of sight it closes and keeps nothing.

**Offline:**
- the line over the field and the empty field say "You're offline. Your words wait here.";
- Send waits;
- a way in puts its words in the field to wait;
- back online, they can go.

**Found while capturing:** letters typed right after Ctrl F landed in the message. The finder is now drawn and focused within the key's own event.

**The independent review found no P1.** Its P2s are fixed:
- Esc only worked inside the field;
- the focus was lost after "Look further back";
- the current match jumped when earlier days came in;
- offline ways in were dead presses;
- the line was cramped on a phone.

**Its P3s are fixed:**
- find keeps nothing after the padlock;
- `body` is no place to give the focus back to;
- a step brings the match into sight again;
- `aria-keyshortcuts` names the platform's key;
- Enter ignores IME composition;
- the toggle has `aria-expanded` and `aria-controls`;
- "İ" no longer hides a turn from the search;
- one counter per turn;
- the offline line shows only where words could go;
- a forced-colours outline marks the current match;
- find closes while the notes cover the conversation;
- the offline check waits before it says nothing went.

## Evidence

**Commands** (browser checks through `D:\Descargas\SophiaV4\.claude-guards\pw-safe.ps1`; units with `node --test` on Node 24.21):
- **Tests first:** the browser checks failed before the change. The talk check is a guard. The find-view units were written with the module.
- **Units:** Personal's, 109 of 109.
- **Personal:** `pw-safe.ps1 e2e/personal.spec.ts --repeat-each=3`: 189 of 192. The 3 failures were the phone-layout check counting a hidden tip. After that check was rewritten, it passed 2 of 2, and the whole spec passed in the full suite below.
- **Full suite:** `pw-safe.ps1`: 353 of 353 passed.
- **Mutations** (`<scratchpad>/mutate-ease-final.py` and `mutate-ease-gate.py`, using Git's bash and the guards): 21 product mutants killed, and the controls survive:
  - matching ×4 (case, pattern, counting, days);
  - the finder ×13 (letters lost, key gate, Enter, wrap, focus back, current, no match, further back, jump, focus after reading back, Esc layer, kept after the padlock, the phone line);
  - offline ×4.

**From the repo root:** `pnpm format:check`, `lint`, `typecheck` and the Studio's build pass.

**Source-register IDs consulted:** none.

## Decisions and changes

**"Find" is a word in the head,** as "Talk with her" and the notes are. The icon set has no magnifier, and the head speaks in words.

**The current match is held as itself (key, n),** not by its index, so reading earlier days in before it can't move it.

**Offline is the browser's word (`navigator.onLine`).** A network that answers nothing while "online" still fails as before, and says so.

## Remaining obligations

**This is the top of a stack: #91 ← #92 ← #93 ← this.** Merge in order, and retarget each PR to `main` before deleting its base.

**From the review, left as is:**
- the count's live region speaks on every keystroke;
- the find field is 13 px, so iOS zooms on focus (the Studio's convention elsewhere too).

**Codex's P2s on #89 and #90 are next,** as their own small PR.

## Next bounded action

Luis reviews the stack.
