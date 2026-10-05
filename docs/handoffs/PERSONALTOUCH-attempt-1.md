# Implementation-session handoff

Goal and attempt: Personal's touch pass, §1 of `docs/plans/personal-moments.md`, attempt 1  
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine  
Native session: a local Claude Code session; its identity is unknown (not exported)  
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/touch` from `personal/presence` (#91) at `4ed4b99`, 2026-10-04  
Ending commit/tree and changed files: content commit `f78a283` (tree `5c73776ecb72`); these files changed:
- `apps/studio/src/features/personal/`: `Conversation.tsx`, `PersonalComposer.tsx`, `PersonalSpace.tsx`, `personal.css`, and the new `note-flight.ts`;
- tests and fixture: `apps/studio/e2e/personal.spec.ts`, `apps/studio/fixtures/personal.tsx`;
- `docs/plans/personal-moments.md` (the plan for the whole pass: touch, moments, ease).

## Outcome

**What a person meets now in Personal:**
- **Copy on her turns,** beside the time. It says "Copied", or "Couldn't copy" when the browser refuses.
- **A reply that lands while you read further up** leaves you where you are. "Sophia answered ↓" waits at the foot of what you see. A press, or reading down to it, brings you there, and the focus stays in the conversation.
- **The field's count** shows from 3,600 characters, over its line at the right. At 4,000 it turns warm and says why it takes no more.
- **A kept note** sends a small light to the notes' count, which brightens once. Under reduced motion the count still brightens, without the flight.
- **A long unbroken word,** such as a pasted link, wraps inside the field. Before, it widened the field to 12,600 px and the whole column left the screen. I found this while measuring the count.

**The independent review found one P1, now fixed:** pressing the line dropped the focus to the page.

**Its two P2s are fixed:**
- the line could outlive an erasure or a lock;
- at 4,000 the count squeezed the field to 13 px on a phone.

**Its P3s are fixed, except where noted below:**
- the line sits outside the scroll, so it moves nothing;
- a reply that lands while the space is hidden counts once you're back;
- Copy is centred on her taller line;
- the brightening fades out too;
- the tests now leave no vacuous passes (boundaries, a line never shown, the light removed, the slower fixture answer);
- the fixture's keep and forget change the notes.

## Evidence

**Commands** (browser checks through `D:\Descargas\SophiaV4\.claude-guards\pw-safe.ps1`: 3 workers, below-normal priority, watchdog, no GPU):
- **Tests first:** the touch checks failed before the change, except "needs no line", a guard.
- **Personal:** `pw-safe.ps1 e2e/personal.spec.ts --repeat-each=2`: 104 of 104 passed.
- **Full suite:** `pw-safe.ps1`: 340 of 340 passed.
- **Mutations** (`<scratchpad>/mutate-touch-final.py` and its two reruns, using Git's bash and the guards): 20 product mutants killed, and the control survives:
  - copy ×3;
  - the line ×5 (pulls you down, no line, line at the end, focus dropped, reading down keeps it);
  - the count ×5 (a step late, undescribed, never full, full a step early, hidden);
  - the flight ×6 (no flight, light left, flies anyway, no brightening, brightens for good, long word widens);
  - Note this while its form is open. That gap was old: the test didn't check it until now.

**From the repo root** (Node 24.21): `pnpm format:check`, `lint`, `typecheck` and the Studio's build pass.

**Source-register IDs consulted:** none.

## Decisions and changes

**The line sits on a bar of no height between the list and the field,** mirroring the day pill's bar at the top. Inside the scroll it would have moved the conversation as it came and went.

**The count shares a row over the field's line with the draft's note.** Inside the bar it squeezed the field on a phone.

**The notes' count brightens whenever it grows.** That covers a note kept from a suggestion and one kept in another tab.

**Davide's #76 files are untouched.** The Work composer (`theme.css` `.message-bar textarea`) likely has the same long-word bug, but `theme.css` is in #76, so it is left for later.

## Remaining obligations

**This PR is stacked on #91.** Merge #91 first, then retarget this PR to `main` before deleting `personal/presence`.

**Untested by a check:**
- the line cleared when the space is erased while it shows (the fixture can't erase);
- `atEnd` going stale when a resize removes the overflow;
- Copy's live text being heard twice by some screen readers. These are from the review's P3s.

**The Work composer's long-word bug,** after #76.

## Next bounded action

§2 Moments (`personal/moments`), then §3 Ease, then Codex's P2s on #89 and #90.
