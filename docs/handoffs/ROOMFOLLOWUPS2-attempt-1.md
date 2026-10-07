# Implementation-session handoff

Goal and attempt: the follow-ups to #114, #115 and #116 (`docs/plans/room-follow-ups-2.md`), attempt 1. It is PR 13 of the room's $20 plan.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/follow-ups-2` on `room/updates` (#116), 2026-10-06
Ending commit/tree: the content commit before this handoff's.

## Outcome

The P2s Codex left on #114 and #115, and the P3 from #116's review, each fixed as the plan lists:
- **The show's focus marker:**
  - it is bound to its version;
  - it is kept on no reply for a minute;
  - it is forgotten on its own refusal, once per refusal.
- **Leave pressed twice during a slow disconnect:** the second press does nothing, and Join waits for the first.
- **«Open» from a recap over another sheet:** it puts every sheet away, through `useDialog`'s `closeEveryDialog`.
- **Recap reads:**
  - each leave reads its own recap;
  - the recap renders once, last in the viewer, in every view.
- **«Close the meeting» and «Mark as seen»:** they keep their focus while answered (`aria-disabled`), and are drawn as disabled.
- **Updates' reads:**
  - they take the query's signal;
  - they say they're waiting, with the slow note after six seconds (`app/Waiting.tsx`).
- **Leaving from an older meeting's sheet:** it opens the left meeting's recap on top.

**Independent review, two passes:**
- **First pass:** no P1, and four P2s, all fixed:
  - a late first leave could end a new call;
  - a marker that never arrived stayed forever;
  - the `aria-disabled` pills didn't look disabled;
  - the note claimed a browser check that didn't exist.
- **P3s fixed:**
  - the recap's place in the tree;
  - a refusal forgetting only its own version;
  - `Waiting` moved to `app/`;
  - the dialog stack;
  - the note.
- **Second pass:** no P1 or P2. Its P3, an effect re-firing on each render while refused, is fixed.
- **Left as is:** the waiting words' live region mounts already filled; the words are a visual wait.

## Evidence

Every run used the guards' gentle mode, waiting for Luis's games to close first.

- **Units:** `focus-arrival.test.ts`, 3 of 3.
- **Browser:**
  - **full suite, both projects:** only the 5 report print and reading checks failed, which fail on this machine and on main locally;
  - `room-present.spec.ts` after the last fix: 15 of 15.
- **Mutations** (`light_mutants.py`):
  - 5 of 5 killed: a second Leave counting, Open leaving the other sheet, one key for every leave, an older meeting holding the recap back, and the stacked Escape from #115's set;
  - the control survives;
  - the double-leave check had first let a second count through; it now waits until the ended call has settled.

**Gates:**
- `tsc`, `oxlint --type-aware` and Prettier pass. They ran directly, because this machine's Node is 24.11.

**Source-register IDs consulted:** none.

**After the PR opened:** Codex's P2 on #118 (a disconnect that rejects left the room live, and every later Leave did nothing) is fixed. The disconnect's failure still leaves this person out of the call. The check `room-recap.spec.ts` «a disconnect that fails still leaves» kills its mutant, and the control survives.

## Remaining obligations

- This PR awaits #116, CI and Codex.

## Next bounded action

A13's «meeting so far» for a late joiner, and search with citations, on the fixture behind the flag.
