# Implementation-session handoff

Goal and attempt: «Proposed · it’s in Still open» says only what is so (`docs/plans/proposed-truth.md`), attempt 1. Two
of Codex's P2s on #174 (C7), answered there as follow-ups; Luis: «Continua».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): follow-ups named in «Goal and attempt».
Writable scope: `apps/studio/src/features/conversations/{ProposeHere.tsx,decide.ts,decide.test.ts,talk-store.ts,
ProjectContext.tsx,NewConversation.tsx}`, `apps/studio/e2e/conversations-decide.spec.ts`, the design note and this handoff.
Runtime unit: the Studio (`apps/studio`); no API change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `conversations/proposed-truth`, stacked on
`conversations/held-decision` (#200, `0286616c`), 2026-10-09
Ending commit/tree: `bdb609d772754b111715377cdf76b54fc36725b2` (tree `3b51bbeb9c30e1d77a8c6ab32ce86fb65f9dfb49`). The commit after it adds only this handoff.

## Outcome

- A message keeps which proposal it made (`ProposedMark`: the receipt's decision id, or the one already waiting, and its
  words), not a flag. Its line follows the brief as the context last read it: «it’s in Still open» while waiting, «no
  longer in Still open» once it has left (decided, withdrawn, or past the newest 50), «Still open couldn’t be read
  again» when the last read failed. No read of its own: an observer of the context's (`enabled: false`).
- After a proposal, the conversations' brief is read again even with no pane showing it.
- One set of options for the brief's read (`contextQuery`): a reader with other options (no `queryFn`, another retry)
  was found mid-way to rewrite the shared query's.

## Evidence

- Written first and failing first: «a proposal decided since…», «proposed while the brief can’t be read again…»,
  and after the review «proposed, then away while it lands…» (`propose=slow`, reads held on coming back).
- `node --test` on the conversations' unit tests: 61 pass (`proposedWhere`, `openAs`). All conversations specs under
  the machine's guard (1 worker): 112 passed, no console error.
- Mutants, then removed: the line always «waiting» (killed), a failed read ignored (killed), the propose's read only
  if active (killed). The control passed each time.
- Prettier, `oxlint --type-aware` on the whole repo, `tsc`.
- Independent review, twice: first a P2 (away while it landed, the line read the brief as it was) — fixed, with its
  check; P3s taken (neutral «no longer in Still open», `openAs` constraints only and used, a key of its own for nobody,
  the check's retry noted). Re-checked: no P1 or P2.

## Limitations and next action

- Every message with a press re-renders when the brief moves (minor; left).
- Stacked on #200: once it merges, retarget to `main` and merge `main` in.
- Next: merge on green CI with no Codex P1.
