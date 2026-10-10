# Implementation-session handoff

Goal and attempt: a decision on its way in Still open says so, and its presses wait (`docs/plans/decide-on-its-way.md`),
attempt 1. Four of Codex's P2s on #174 (C7), answered there as follow-ups; Luis: «Sigue con lo siguiente de la cola».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): follow-ups named in «Goal and attempt».
Writable scope: `apps/studio/src/features/conversations/{ProjectContext.tsx,decide.ts,decide.test.ts,conversations.css}`,
`apps/studio/fixtures/mission-writes.ts`, `apps/studio/e2e/conversations-decide.spec.ts`, the design note and this
handoff.
Runtime unit: the Studio (`apps/studio`); no API change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain` (then `Sophia-decide`), branch `fix/decide-on-its-way` from `main` (`5928a9c1`), 2026-10-08
Ending commit/tree: `da325a3d91d94238a473848df2b93ec0d7edc89b` (tree `33a49123730eece127231e50b9bf1c6ac67c34ee`), after main merged in (#189's account keys). The commit after it adds only this handoff.

## Outcome

- While a decision goes, Still open says «Accepting…» or «Declining…», with the long wait's line after six seconds;
  Decline waits drawn as a waiting press (the Studio's rule, #187).
- Answered, or refused as stale, a decision settles once the brief has been read again (`useDecide` awaits it, as a
  proposal does): what it says agrees with what shows. With no reply it doesn't wait for that read.
- The presses wait while it goes, while unknown, and once answered while the brief still lists it (`pressesWait`); a
  read that failed keeps them waiting, «This may be out of date. Try again» the way on.
- The status takes the focus whatever the answer, if the focus is still in Still open or was lost with its press;
  never from where the person went (the composer).
- A 409 is worded from the brief read again (`decideRefusal`): still waiting, «It can’t be decided as it is: the brief
  changed since…»; gone, «Someone decided it first…»; the read failed, «It wasn’t decided here: the brief changed
  since.»

## Evidence

- Written first and failing first: `decide.test.ts` (no `pressesWait` / `decideRefusal`), and the five new or changed
  `conversations-decide.spec.ts` checks, run against main's `ProjectContext.tsx` and `decide.ts` with the new fixture:
  5 failed, each on what it checks («Accepting…» absent, the stale words, the presses awake).
- With the fix: `node --test` on the conversations' unit tests, 54 pass; `conversations-decide.spec.ts` under the
  machine's guard (1 worker): 16 passed, before and after main merged in (#189 changed the brief's query key to the
  account, in both files; the merge kept both).
- Mutants, unit (against `decide.test.ts`): answered never waits, unknown wakes, freshness ignored, still-waiting
  ignored: each killed; control passed. End to end (the five checks): the focus taken always, no «Accepting…»: killed;
  answered never waits on the brief (the presses wake): killed; a 409 not waiting for the read again: survived at first
  (the check saw «Accepting…» while the write was on its way), then killed once the check holds half a second past the
  answer. The control (a comment) passed each time.
- Prettier, `oxlint --type-aware` on the whole repo, `tsc`.
- Independent review: no P1. Its three P2s taken: the refusal worded from the brief before the 409 (now after the read
  again), a fixture case the API never gives (a replaced proposal marked stale), the focus taken from where the person
  went. Its P3s: the orphaned comment moved; «Declining…» and the 6 s line not covered end to end.

## Limitations and next action

- A replacement refused this way still waits, unchanged: an Accept is refused again with the same words; telling it
  apart before the press (its `supersedesDecisionId` no longer accepted) is a later step.
- The other #174 follow-ups (an unconfirmed decision held across views; «it's in Still open» after a failed read or a
  decision) are their own PRs.
- Next: merge on green CI with no Codex P1.
