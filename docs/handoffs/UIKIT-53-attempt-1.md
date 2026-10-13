# Implementation-session handoff

Goal and attempt: UIKIT-53 (small follow-ups; Codex P2s on #239, #240, #241, #260 and #264; Luis: «atiende los P2 en
PRs pequeñas»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/p2-small` from `main` at `32854caf`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`), on branch `ui/p2-small`; no service
code, no deploy, no contract.
Runtime unit: Luis's Windows host (node's test runner); CI (GitHub Actions) as the run on record. Playwright on this
host was refused by the machine guard (free RAM under 6 GB with AION2 open).
Existing authority: Luis's standing instructions for the kit follow-ups (push to `ui/*`, answer Codex's threads with a
fix commit, cancel superseded CI runs on `ui/*`); merges are Luis's, with no open P1. Spending: no paid service; CI
minutes only.
Ending commit/tree: `e89fc7d2f79a` (tree `286622a4bb1f`), the last commit of `ui/p2-small`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 15 files changed against
`origin/main` at that commit: `e2e/conversation-acts.spec.ts`, `e2e/eyebrows.spec.ts`, `e2e/palette-knows.spec.ts`, `e2e/personal.spec.ts`, `src/app/App.tsx`, `src/app/Palette.tsx`, `src/app/palette-recent.test.ts`, `src/app/palette-recent.ts`, `src/features/conversations/MessageActs.tsx`, `src/features/conversations/conversations.css`, `src/features/personal/personal.css`, `src/features/updates/updates-narrow.test.ts`, `src/features/updates/updates-view.ts`, `docs/handoffs/UIKIT-53-attempt-1.md`, `docs/plans/p2-small.md`. The review notes below name the commit of each later change.

## Outcome

- See `docs/plans/p2-small.md`. Answers threads 4249614619 (#239), 4249590204, 4250221807, 4250221816 (#240),
  4250199851 (#241), 4249581694 (#260), 4249597482, 4250212890 (#264); 4250212253 (#239) answered as left for a
  single-task read.

## Evidence

- Unit: the reserved labels and `forgetRecent`, written first and failing; the whole Studio suite 1098/1098; lint
  (type-aware), typecheck and Prettier clean.
- Three browser checks written first (`conversation-acts`, `personal`, `palette-knows`); not run on this host (guard).
  CI is the run on record.

## Remaining obligations

- CI on the PR; the independent review (Codex) with no open P1 before merge.

## Next bounded action

The last follow-up: the lens and the addressed needs (Codex P2s on #238, #242, #245).

## Post-review (Codex on #283)

- `ad290ec8`: «Recent» is forgotten whenever the signed-in account changes, the auth listener's changes included
  (`useRecentOnlyOf` on `signedInAs`); the palette scrolls to the active row by the same place-based id the field
  names; a continued message whose side row says something keeps 52 px under its bubble, so the row never lies over the
  next message. Checks: conversation-acts.spec (the row clear of the next message), palette-knows.spec (arrowed past the
  rows in sight). CI is the run on record (local guard).

## Post-review, round 2 (Codex on #283)

- `534a50c6`: «Recent» is kept with its owner (`RECENT_OWNER_KEY`, `recentFor`): any account signed in that is not the one
  noted forgets it, a cold load after an expired session included. A side row saying something keeps its measured
  height under its bubble (`--acts-room`, from MessageActs), wrapped lines and all. Checks: palette-recent.test
  (owners), conversation-acts.spec (the long «earlier copy landed» status clear of the next message). CI is the run on
  record (local guard).

- `e89fc7d2`: the row's room is read whenever the row holds any status (a proposal's through `propose` too), again as it changes size (ResizeObserver), and given back when the row goes. No new browser case: a proposed continued message needs a proposal staged on a run, which the fixture does not offer (round 3, Codex on #283).
