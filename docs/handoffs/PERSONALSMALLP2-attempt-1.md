# Implementation-session handoff

Goal and attempt: four small follow-ups from Codex (`docs/plans/personal-small-p2.md`), attempt 1  
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine  
Native session: a local Claude Code session; its identity is unknown (not exported)  
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/small-p2` from `main` at `5e402c7`, 2026-10-05  
Ending commit/tree and changed files: content commit `34cd84d`. These files changed:
- in `apps/studio/src/features/personal/`: `PersonalComposer.tsx`, `PersonalSpace.tsx`, `Find.tsx`, `Conversation.tsx`, `conversation-view.ts` and its test;
- `apps/studio/fixtures/personal.tsx` (`spaceAfter`, `readSlow`);
- `apps/studio/e2e/personal.spec.ts`;
- `docs/plans/personal-small-p2.md`.

## Outcome

**Length in characters.**
- **Before:** 2,001 emoji never went, and the field stopped typing at 2,000 of them.
- **Now:** a message's length is counted in characters (code points), as the API's JSON Schema (Ajv, unicode on) and the database (`length()` in UTF-8) count. That applies to the count, Send, the send itself, and words handed from Home.
- The field has no `maxLength`, because `maxLength` counted UTF-16 units. Past 4,000 characters the count says how far over, and Send waits.

**Find once the conversation is read.** Before that there is no Find toggle, and Ctrl/⌘ F is the browser's.

**Today's moment before anything is said.** A return after a week or more, or on a milestone day, opens today's divider with its moment ("12 days later", "a month together"). A turn stamped ahead by a skewed clock never makes two "Today" dividers.

**"Look further back"** says "Reading…" and waits while the earlier days come in.

**The independent review found one P1.** Lint refused the spread on a string. It was already fixed by counting surrogate pairs; `Intl.Segmenter` would count graphemes, which isn't what the API counts.

**No P2.**

**Its P3s, fixed:**
- one Today on a skewed clock;
- the length computed once and passed to Send;
- the tests check the exact words sent, the key taken once the space is read on any platform, and a 3 s load window;
- the fixture's duplicate hook is gone and its header is updated;
- the count's comment is current.

## Evidence

**Commands** (browser checks through `D:\Descargas\SophiaV4\.claude-guards\pw-safe.ps1`):
- **Tests first:** the three browser checks and the unit test failed before the change.
- **Units:** Personal's, 110 of 110. The clock-change test now restores the zone by name, because deleting `TZ` left Windows in UTC for the tests after it.
- **Personal:** `--repeat-each=2`, 174 of 174.
- **Full suite:** 411 of 415. The 4 failures are in `report-page.spec.ts`, from work merged to main; on `origin/main` itself the same spec fails the same 4 on this machine (a Windows `pdfjs` font path, and print widths).
- **Mutations** (`<scratchpad>/mutate-small2.py`, using Git's bash and the guards): 7 product mutants killed, and the control survives.

**From the repo root:** `pnpm format:check`, `lint`, `typecheck` and the Studio's build pass.

**Source-register IDs consulted:** none.

## Remaining obligations

**This PR awaits Luis's merge OK.**

**Follow-ups still open:**
- the recovery write race (a CAS write);
- an unseen reply when coming back to Personal;
- words handed while the epoch is unknown;
- #91's pin of the latest exchange;
- "Reading…" switching off early when a read started from the days menu (the read in flight isn't shared);
- the notes, memory and Work fields still count UTF-16 units against limits counted in characters;
- the Work composer's long-word bug, after #76.

## Next bounded action

Luis reviews the PR.
