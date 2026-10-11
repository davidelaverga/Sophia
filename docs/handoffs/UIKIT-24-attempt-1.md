# Implementation-session handoff

Goal and attempt: UIKIT-24 (a view's title at the size of a title: 28 px on 32 for Goals, Tasks, Knowledge, Updates,
Resources; informe-ui-premium §3 movement 2, first half), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/view-titles` from `ui/needs-api` at `93e6f229`
(stacked on PR #245 → #244 → … → #220; the base retargets as each merges)
Ending commit/tree: `77b6c727` (tree `eb04708c9a8b`): 7 files: `theme.css` (tokens `--type-view`, `--lh-view`; the
two rules), `e2e/view-titles.spec.ts` (new, 12 tests), `type-scale.spec.ts`, `work.spec.ts`, `resources.spec.ts`,
`updates-quiet.spec.ts` (the pinned scale), `docs/plans/view-titles.md`. The commit after it adds only this handoff.

## Outcome

- `.view-head h2` (Goals, Tasks, Knowledge, Resources) and `.updates > h2` go from 20/24 to 28/32, weight 600 and
  tracking −0.02em as every heading. Nothing else moves: the four text sizes and the headings' ramp stay.
- `view-titles.spec.ts`: on the five views and the work space, at 1440 and on a phone, the title computes
  `28px/32px 600` and no visible text on the page is larger.
- The pinned scales (`type-scale` SCALE, `work` `.goals`, `resources` `.resources`, `updates-quiet`) read `… 14 · 28`.
- Not in this PR, named in the plan: section heads at 15–16 (a card decision), the data under 11 px (UIKIT-19 settled
  it), the Places column's head in the app shell (20 px, a column), and no radii PR (the report's 999 / 2 / 1 px are
  the kit's pills and hairlines, fenced by `chips-radii.spec`).
- Unverified here: the Playwright run (the local guard); CI is the run on record.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm --filter @sophia/studio typecheck`: clean.
- Measured in the page (the pane at 1440×900), after `touch theme.css`: Goals, Tasks, Knowledge, Updates, Resources and
  `work.html` each read title `28px/32px 600 -0.56px`, box 32 px tall, largest visible font size 28 (the h2).

## Decisions and changes

- 28 on 32 and not 32 on 40: twice the title step, the grid's next line, a little over half of Home's 52; Home → a
  project is a step down, not a fall, and a phone keeps it under the greeting's 38.
- Tokens and not a literal: `--type-view` / `--lh-view` beside the scale, so the next view (or the Places head, if
  Luis wants it) takes the same step.

## Remaining obligations

- Watch CI; the independent review (Codex) with no P1/P2 before merge. The base is `ui/needs-api` until #245 merges.

## Next bounded action

Informe-ui-premium §6, step 2: Knowledge's HTML thumbnails on the dark surface (movement 4).
