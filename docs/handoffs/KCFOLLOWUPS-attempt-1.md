# Implementation-session handoff

Goal and attempt: the Codex P2s left on #152, #153 and #155 after their last pushes, in one follow-up, attempt 1. Luis
chose to merge those PRs with no P1 and to gather their last P2s here («Procede»).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `follow-ups/knowledge-conv-p2s` from
`knowledge/quiet` with `conversations/thread` merged in, 2026-10-07
Ending commit/tree: `32dcc6f8db609b0a7ff9181d69b994699509b032` (tree `2194b06120f1756a95f54f661b88ed7adc4df195`). The commit after it adds only this handoff.

## Outcome

- **#152, a missing version reread only within reach:** a tile whose card names a version its cached list lacks (the
  viewer read the list; the report was published since) reads the list again only once it comes near
  (`ReportCover.tsx`, `absent` behind `near`). Before, the reread bypassed the reach gate.
- **#153, the multi-project fixture honours every filter:** the other project's report has its own ids
  (`ELSEWHERE_REPORT`, its versions and empty sources answered); words and format apply to it as to this project's
  (`matchesFilter`, shared); every project lists it after this project's, on the last page; a project with nothing
  left under the filters is not offered.
- **#155, a finger's reach:** under a coarse pointer the conversations' icon controls and Send are 40 px.

## Evidence

- New checks:
  - `knowledge-library.spec.ts` «a tile out of reach whose card names a newer version reads nothing, until it comes
    near» (the fixture's `card=ahead`; the tiles pushed far below before they render).
  - `knowledge-filters.spec.ts` «every project: this project's reports, then the other's, the words and the format
    kept for both» and «the other project pressed keeps the format».
  - `conversations-panes.spec.ts` «@phone · on touch, every icon control and Send are at least 40 px».
- Knowledge specs 25 passed; conversation specs 57 passed.
- Mutants, each killed with its control surviving: the reread out of reach, every project leaving theirs out, their
  report ignoring the filters, the icon controls left at 30 px. Two of them first «survived» in the batch: Vite had
  not taken the fixture's change in before the run. Run by hand after a pause, both are killed; the runner now
  waits 4 s after each change.
- Prettier, `oxlint --type-aware` (clean but `brand-assets.mjs`, already on `main`) and `tsc`.

## Limitations and next action

- Still open from the handoffs of #152–#155: the P3s listed in `CONVERSATIONS-attempt-1.md`; demo `design=designing`
  over the demo default; the demo's 2 versions by default; #147's tips at ≤ 600 px.
- Next: merge `main` (with #153, #154 and #155 in) into this branch, then open the PR.
