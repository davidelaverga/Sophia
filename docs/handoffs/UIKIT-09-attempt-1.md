# Implementation-session handoff

Goal and attempt: UIKIT-09 (informe-30 §2.2: every leading on the 4 px grid, three weights), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/type-leading` from `ui/kit-chip` at `044893ee`
(stacked on PR #230 → #229 → #228 → #227 → #224 → #223 → #222 → #221 → #220; the base retargets as each merges)
Ending commit/tree: `ba86f519` (tree `fc9b8010a43e`): 10 files, 1 new (`docs/plans/type-leading.md`); the rest are
the Studio's sheets (`theme.css`, `artifacts.css`, `conversations.css`, `personal.css`, `explore.css`,
`resources.css`, `board.css`) and the spec (`type-scale.spec.ts`, `type-sizes.ts`). The commit after it adds only
this handoff.

## Outcome

- Leading tokens (`--lh-small` 16, `--lh-body` 20, `--lh-head` 24) and one rule for every element,
  `* { line-height: round(down, 1.55em, 4px) }`, so each size finds its step on the grid; the page's base reads
  `var(--type-body) / var(--lh-body)`.
- 27 ratio lines gone from the Studio's sheets; 34 `font` shorthands carry their leading by token; the headings at 20
  name 24, the screen title 32; the personal thread's two voices (15, 16) keep 24 by name.
- Weights: 300 → 400 (the breadcrumb's bars, 15 → 13 too), 480 → 500 (Home's rows), 560 → 600 (two `strong`s),
  700 → 500 (a lane's count, which inherited its heading's bold). The greeting keeps 440.
- Sizes no view measured: `.mono`, `.chat-spoken`, `.recap-section h3` 11.5 → 12; Explore's 11.5 and 12.5 → 12.
- `type-scale.spec.ts` grows: Goals, Tasks and Resources join the views; every view and place measures `typeOff`
  (leading on the grid or the box's own height; weight 400 · 500 · 600).
- Unverified here: the Playwright run of `type-scale.spec.ts` (the guard keeps refusing a browser run beside the open
  game); CI is the run on record for it and for the specs that read a leading (`join`, `resources`, `personal`,
  `report-reading`, `report-probes`).

## Evidence

- `pnpm format:check`, `pnpm lint` (type-aware), `pnpm typecheck`: clean (Node 24.21.0 from `~/.sophia/node`).
- `node --test "packages/ui/src/**/*.test.ts" "apps/studio/src/**/!(*.db|*.live).test.ts"`: 1054 passed.
- The spec's measure (`typeOff`'s logic), run in the page (the browser pane, 1280×800, served on 5197), after the
  change, on all thirteen fixture pages: no word off the grid or the weights. Combinations of size, leading and
  weight (mono counted apart): Conversations 24 → 16, Tasks 22 → 15, Resources 12 → 10, Home 9 → 6, the personal
  space 6, Knowledge 8, the room 7, the call 8, Updates 7, Goals 7, sign-in 4, the door 4, the work space 12.
- Conversations' sixteen, after: 10.5/16 (400 and 500 mono, 600), 10.5/20 and 10.5/24 mono (a label in a 20 px row,
  a text button in a 24 px line), 12/16 (400, 500, 600), 12/20 (400, 500: words in a 20 px row), 13/20 (400, 500,
  600), 14/20 (400, 600), 18/24 (600).
- Before the change, the same measure on Conversations: 19.5, 18, 15.75, 20.15, 21.45, 16.8, 10.5, 13.65, 12.6 and
  22.5 px of leading, 300 on the breadcrumb's bars; on Tasks 700 on the lanes' counts.
- `CSS.supports('line-height', 'round(down, 1.55em, 4px)')` is true in the pane's Chromium 152; the project's
  Playwright is 1.63 (Chromium 140+), where `round()` has been since 125.
- Seen in the pane: Home (the greeting, the rows), the personal thread, Conversations (the bubbles and the rows).

## Decisions and changes

- One rule per element rather than a leading beside each size: a `line-height` set once on `body` is inherited as a
  length and would not follow a child's size; the universal rule computes per element and any named leading wins.
- `font` shorthands must say their leading: without one the shorthand resets it to `normal`, which the universal rule
  cannot reach.
- 15 px lines (the sheet titles, the breadcrumb's crumb, the research card's question, a goal's title) take 20, as 14
  does; the personal thread's 15 keeps 24 (its reading leading, measured by `personal.spec.ts`).
- Kept as their own: a report's page (`.md`, a document's ramp), a PDF's text layer, the greeting (display, 1.02),
  glyphs sized to their circles (`.avatar`, `.tile-initial`, `.pdot`), the project name centred in its 48 px bar.
- The informe's «≤ 8 combinations per screen» is not gated: sizes × weights × mono stay above it where a view mixes
  labels, data and words (Conversations 16, Tasks 15). Counted here.

## Remaining obligations

- Watch CI for `type-scale.spec.ts` and the specs that read a leading; fix in this PR what the pane did not see.
- The independent review (Codex) with no P1/P2 before merge. The base is `ui/kit-chip` until #230 merges.

## Next bounded action

Informe-30 §2.1 (the kit) and §2.2 (the type scale's leadings and weights) are in. §2.3 (hover, pressed, focus in
every control) is covered by the Button's and the Card's states; what remains of it is the controls the informe named
without a hover (Home's rows, «This project / All projects», the list of Conversations, «Send», «Decline»): a sweep
of its own, measured by a hover check per control.
