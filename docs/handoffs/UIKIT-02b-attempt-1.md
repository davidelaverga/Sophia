# Implementation-session handoff

Goal and attempt: UIKIT-02b (the kit's third piece: `Segmented`, and the segmented scale), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/kit-segmented` from `ui/kit-input` at
`da2eb1b7` (stacked on PR #221, itself on #220; the base retargets as each merges)
Ending commit/tree and changed files: `3a464106` (tree `abac5ed1711b`): 19 files, 7 new (`Segmented.tsx`,
`segmented-class.ts`, `segmented-class.test.ts`, the kit's `roving.ts`, `e2e/segmented-scale.spec.ts`,
`docs/plans/segmented-scale.md`, this handoff). The commit after it merges `ui/kit-input` forward and corrects these
numbers.

## Outcome

- `@sophia/ui` exports `Segmented` (role × items × value, the thumb, the arrows and the one Tab stop inside) and
  `nextInRow` (moved from the Studio; `app/roving.ts` re-exports it from `@sophia/ui/roving`).
- Seven boxes render through it, their look unchanged: the room's lenses, the board's lenses, Resources' filters,
  Knowledge's format and project filters, the places' switch, the report viewer's format switch (now the small size:
  26 → 24 px presses in a 32 px box).
- Every segmented box on the fixture pages is 36 px with 28 px presses (32 with 24 when small), and its thumb lies
  under the press that is on. Before: the viewer's switch 32 / 26; the board's box 35; the room's and Knowledge's
  thumbs 2–3 px astray once the web font had loaded.
- Unverified here: the Playwright run of `segmented-scale.spec.ts` (the guard keeps refusing a browser run beside the
  open game). CI is the run on record for it, and for the room's, the board's and Resources' own specs.

## Evidence

- `pnpm format:check`, `pnpm lint` (type-aware; `Segmented` split into the box and its `Press` to stay under 60
  lines), `pnpm typecheck`: clean.
- `node --test "packages/ui/src/**/*.test.ts" "apps/studio/src/**/!(*.db|*.live).test.ts"`: 1038 passed (the eight
  new among them). `app/roving.test.ts` passes through the re-export: the kit exports `./roving` on its own path, so
  Node loads a `.ts` and never the `.tsx` index.
- The spec's measure, run in the page on this worktree's fixture pages (the browser pane, 1280×800, served on 5197):
  Resources 36 / 28, thumb under «All», stops 0,-1,-1,-1, ArrowRight selects and focuses «Waiting»; the room 36 / 28,
  ids `lens-converse…`, `aria-controls` lens-stage, `aria-describedby` lens-note, three tips, ArrowRight selects and
  focuses `lens-explore` and the stage shows Explore; Tasks and the work space 36 / 28 (Tasks was 35 before the
  floor); Knowledge's project filter 36 / 28 and the viewer's format switch 32 / 24 in 12 px, both thumbs under their
  press within a pixel after the thumb change (before: x 81 for an option at 84, w 68 for 70; w 92 for 94).
- The places' switch is not on a fixture page at 1280 (the bar's switch belongs to the app's places; the fixture pages
  render one place at a time): migrated by the same markup as the others, checked by typecheck and by eye in code.
- Control mutant, in the page (earlier pass): with the thumb placed only on the box's resize, the measure reported the
  room's and Knowledge's thumbs astray; with the option observed too, under.

## Decisions and changes

- `Segmented` owns what the six copies each did by hand: the thumb (`useSlidingThumb`), the roving arrows and the one
  Tab stop (tabs and radios), and the attribute of the role that says a press is on (`aria-selected`, `aria-checked`,
  `aria-pressed`). A `group` keeps each press a Tab stop, as before.
- `useSlidingThumb` observes the active option and listens for `document.fonts.ready`, not only the box: the web font
  reshapes the options without always widening the box.
- `.segmented` and `.segmented.sz-sm` carry a floor (36 / 32), as the fields do.
- The theme's «on» rules include `aria-pressed` (one rule for the three roles); the knowledge and places rules that
  said the same stay, harmless.
- Not moved: the underline tab strips (`.sheet-tabs` 34, `.side-tabs` 36, `.report-tablist` 38) and the four rows
  that still call `nextInRow` by hand (`GoalTabs`, `SidePanel`, `InviteSheet`, `DocumentPane`): they take a `Tabs`
  piece next.

## Remaining obligations

- Watch CI for `segmented-scale.spec.ts` and the room's, the board's and Resources' specs; fix in this PR what the pane
  did not see.
- The independent review (Codex) with no P1/P2 before merge. The PR's base is `ui/kit-input` until #221 merges.

## Next bounded action

UIKIT-03: `Tabs` (the underline strip at 36, its line under the one that is on, the arrows inside) for the Invite
sheet, the room's side panel, the report viewer's tabs and the goal tabs; then `Sheet`, `Menu`, `Card`, `Skeleton`.
