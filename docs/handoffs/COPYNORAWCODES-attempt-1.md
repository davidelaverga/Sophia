# Implementation-session handoff

Goal and attempt: what a person reads carries no raw code (`docs/plans/copy-no-raw-codes.md`), attempt 1. The
microcopy review's second pattern; Luis: «Empieza con el 3 y el 2».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a copy fix named in «Goal and attempt».
Writable scope: `apps/studio/src/api/{client.ts,client.test.ts,vision.ts}`, `apps/studio/src/features/artifacts/{report-view.ts,report-view.test.ts}`, `apps/studio/src/features/work/planning/{results.ts,results.test.ts}`, the design note and this handoff.
Runtime unit: the Studio's words (`apps/studio`); no API, contract or data change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `copy/no-raw-codes` from `main` (`6d21e64f`), 2026-10-10
Ending commit/tree: `52e8b06001816558a64a831ac13162c819485268` (tree `c0043dc88c8276451e7fffa9316a1a3fa59aaf8e`). The commit after it adds only this handoff.

## Outcome

- No HTTP status in a refusal's words (it stays the error's code); a reply that breaks the contract reads «Sophia’s
  reply couldn’t be read.» (the contract's words kept as the error's cause), as do the vision's own checks.
- An unknown reason reads «No report was produced.»; the PDF's failure keeps a reason given in words and loses a code,
  in the Studio's words and in the service's own bracketed line.
- A source names no service and no status code: «A search snippet», «Read from the page», what the page answered.
- A version line names its kind, no media type, no hash.

## Evidence

- The unit checks were written first with the new words (and the service's real PDF line): each failed, then passes.
  Unit tests: 1017 passed.
- Under the machine's guard (1 worker, low priority): `report`, `knowledge-origins`, `work`, `room-work` (247) on
  the first commit; `report`, `work`, `room-updates`, `updates-quiet` (255) on the final one.
- Mutants with a passing control: the status back in the message, the contract's words shown, a reason code shown, a
  vendor named, a status code shown, the media type shown, the service's bracketed code kept, a reason's words dropped:
  each fails its check.
- Prettier, `oxlint --type-aware` on the whole repo, `tsc --noEmit` for the Studio.
- Independent review (committed objects): no P1. Its P2s taken: the service's PDF line still carried its code (now
  taken out); a version's id is a UUID in production, not «v2» (the note says so; naming versions is left for its own
  decision). Its P3s taken: a PDF reason in words kept, the vision's checks, the test's old wording.

## Limitations and next action

- The board's «r3» and a version's id (a UUID in production) stay: how the board names revisions and versions is a
  naming decision for the review's fourth pattern.
- Nobody logs an error's cause yet: it is there for whoever debugs, by inspecting the error.
- Next: merge on green CI with no Codex P1.
