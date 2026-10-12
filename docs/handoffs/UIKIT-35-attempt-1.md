# Implementation-session handoff

Goal and attempt: UIKIT-35 (the views' nav whole at 1280 with the room idle — Luis, 2026-10-12: «continúa puliendo»),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/polish-nav` from `ui/polish-tasks` at
`a2dee45e` (UIKIT-34's head; stacked on PR #258 → #257 → #254 → … → #220; the base retargets as each merges)
Writable scope: this worktree only (`apps/studio`, `packages/ui`, `docs/plans`, `docs/handoffs`; a contract amendment
only where its note says so), on branch `ui/polish-nav`; no service code, no deploy.
Runtime unit: Luis's Windows host (the fixture dev server on :5197; Playwright through
`.claude-guards/safe-run.ps1`, 2 workers); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit stack (push to `ui/*`, answer Codex's threads with a fix
commit, cancel superseded CI runs); merges are Luis's, with no open P1. Spending: no paid service; CI minutes only.
Ending commit/tree: `71a81669d0bb` (tree `c123fbf8a2f2`), the last commit of `ui/polish-nav`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 4 files changed against
`ui/polish-tasks` at that commit: `e2e/widths.spec.ts`, `src/app/theme.css`, `docs/handoffs/UIKIT-35-attempt-1.md`, `docs/plans/nav-fits-1280.md`. The review notes below name the commit of each later change.

## Outcome

- At 1280 with the room idle the seven views stand whole in the nav: 500 px in the 515 it has, no fade at either end.
  Before: 528 needed, «Resources» cut under the right fade on Conversations, «Studio» cut at the left on Updates.
- A view's lead is 8 px on each side (was 10); its words, size and weight are unchanged.

## Evidence

- `widths.spec.ts`: two tests (Updates and Conversations at 1280: the nav's scroll width is its width, no `data-more-*`,
  the first and the last view whole). Run locally through the guard with `dock-header.spec` and `press-answers.spec`:
  34 passed.
- Measured after (headless Chromium 1280 × 800, Updates): `clientWidth` 500, `scrollWidth` 500, neither end hides
  more. Capture in Luis's `evaluacion-2026-10-12/nav-1280-after.png`. In a call the dock is 189 px and the connection
  pill yields (#254): the nav keeps 556 there.
- `pnpm exec oxlint --type-aware .` and `tsc --noEmit -p apps/studio` clean; `prettier --check` clean.

## Decisions and changes

- The lead, not the end cluster: hiding the connection pill's words at 1280 would have taken a status away for 13 px;
  two pixels off each side of seven words gives 28 and keeps everything said.
- After the review (Codex on #259): the 1280 px nav test waits for `document.fonts.ready` and polls its reading, so
  a fallback face (narrower) or an overflow read a frame late cannot pass or fail it by chance.

## Remaining obligations

- Watch CI for `widths.spec.ts`; the independent review (Codex) with no P1/P2 before merge. The base is
  `ui/polish-tasks` until #258 merges.

## Next bounded action

Knowledge's cards and Updates' rows read with the same measures (a long chip beside a name); the context pane's eyebrow
hierarchy on Conversations for Luis's eye.

## Post-review (Codex on #259, second round)

The narrow nav's padding compensates the 8 px link padding (was 10): the first word starts at the gutter (@phone test).
The 1280 px test waits for `drawn(page, DRAWN.updates|conversations)` before fonts and polling.

## Post-review (Codex on #259)

- A viewer's header (`role=viewer`, «Copy project link») keeps the seven views whole at 1280: the link's words fold to
  its icon and tip up to 1320 (they folded at 1240). widths.spec adds the viewer case; with the old breakpoint it fails.
- The phone's gutter check opens the first view (the Studio), so no current link is scrolled out of the gutter first.
