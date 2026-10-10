# Implementation-session handoff

Goal and attempt: UIKIT-07 (the kit's eighth piece: the states, `Skeleton` + `EmptyState` + `ReadNote`), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/kit-skeleton` from `ui/kit-card` at `067f0b7d`
(stacked on PR #228 → #227 → #224 → #223 → #222 → #221 → #220; the base retargets as each merges)
Ending commit/tree: `0c34ba54` (tree `28126b949e79`): 29 files, 7 new (`Skeleton.tsx`, `EmptyState.tsx`,
`ReadNote.tsx`, `state-class.ts`, `state-class.test.ts`, `e2e/states.spec.ts`, `docs/plans/states.md`). The commit
after it adds only this handoff.

## Outcome

- `@sophia/ui` exports `Skeleton` (`label` said as a status, `kind` bars / card / row, `count`, the host's grid by
  `className`), `EmptyState` (the sentence, `actions` under it, `slot`), `ReadNote` (a status line), and the pure
  `skeletonClass` / `emptyClass` / `STATES`.
- One look in `theme.css`: `.skeleton-shape` and its light (`skeleton-light`, 1.6 s, each shape's inline delay
  inherited by its bars, still under less motion), `.skeleton-card`, `.skeleton-row`, `.empty`, `.empty-slot`,
  `.read-note`.
- Reading moves onto `Skeleton` in Resources (six cards), Knowledge (three cards), Goals (a row of bars) and Home's
  index (three rows); twelve lines of words become `ReadNote`s (DocumentPane ×4, PdfView, ReportHistory ×2,
  SourcesList, TaskCard, PasskeySheet, AfterMeeting); nine empty states become `EmptyState` (Goals' none and search
  miss, Knowledge's two, the pulse's, the board's lanes as slots, the conversation's, the personal notes', the
  personal projects', Resources'). The features' own rules for these (`.resource-placeholder`, `.goal.skeleton`,
  `.hw-row.placeholder`, `.lane-empty`, `.chat-empty`, `.ps-empty`, `.c3-empty`, `div.empty`) are gone; the class
  names stay where a spec or a layout rule names them.
- `resources.spec.ts` names the kit's shapes (`.skeleton-shape`) where it named `.resource-placeholder`.
- Unverified here: the Playwright run of `states.spec.ts` (the guard keeps refusing a browser run beside the open
  game); CI is the run on record for it and for the features' own specs (Resources' placeholders, Knowledge's
  filters, the personal notes, the board's lanes, the report pane's read lines).

## Evidence

- `pnpm format:check`, `pnpm lint` (type-aware), `pnpm typecheck`: clean (Node 24.21.0 from `~/.sophia/node`).
- `node --test "packages/ui/src/**/*.test.ts" "apps/studio/src/**/!(*.db|*.live).test.ts"`: 1052 passed (1048 + the
  4 of `state-class.test.ts`).
- The spec's measure, run in the page (the browser pane, 1280×800, served on 5197), after the change:
  - Resources `?loading=1`: `skeleton skeleton-card resource-grid resource-placeholders`, `aria-busy`, the status
    «Reading the resources…», six shapes 313 wide in the tiles' grid, each 16 × 14 of padding, 12 px, the plane,
    150 min; bars 14×156 · 10×283 · 10×198; the light `skeleton-light 1.6s` at 0 / 0.08 / 0.16 / 0.24 / 0.32 /
    0.4 s.
  - Goals with none (`/room.html` → Goals): `.empty`, the third ink `rgba(236, 235, 241, 0.52)`, 13 px, `18px 0px
    24px`, no edge; the sentence first, then one `control-row` with two presses.
  - A board lane (`/work.html?case=closed`): `empty empty-slot lane-empty`, the third ink, 12 px, `0px 12px`, a 1 px
    dashed edge, 56 min, centred.
  - Knowledge with nothing matching (the search set to «zzzz»): `.empty`, the third ink, 13 px, 18 · 24; the
    sentence with «Clear the filters» inside it.
  - The personal space with no notes: `empty ps-empty`, the third ink, 13 px, 18 · 24.
- Before the change: Goals' and Knowledge's reading a 120 px block with no status and no shapes; `.view-note` at 12
  px with 10 · 2; `.chat-empty` centred at 12 with 24 · 8; `.ps-empty` at 4 · 8 in `--text-sec`; `.c3-empty` at
  24 · 0; the lane in its own dashed rule.
- Not measured in the pane: Home's index reading (no fixture switch holds the projects' read) and the read notes (the
  fixtures answer at once); both are rules and structure the page holds, and the read notes keep their words, which
  the report specs name.

## Decisions and changes

- A skeleton names no layout: the host's grid places the shapes (Resources passes `resource-grid`, Knowledge
  `report-cards`), so a card skeleton is as wide as the cards it stands in for. Its shapes' delay is inline
  (`animationDelay`), inherited by the bars, so the kit types no custom property.
- The empty state is the body type (13 px) in the third ink everywhere; the slot keeps the board's small type. The
  conversation's empty line is no longer centred and the personal space's no longer `--text-sec`: one look.
- Knowledge reads with three card shapes (its grid) where it drew one block; Goals with one row of bars.
- The read notes keep their words («Loading the report…»: the specs name them) and gain `role="status"`.
- `ProjectContext`'s `Waiting` and the sending lines («Sending…», «Asking for the PDF…») stay: a wait of its own, and
  an action's progress, not a read.

## Remaining obligations

- Watch CI for `states.spec.ts`, `resources.spec.ts` (the placeholders), `knowledge-filters`, `personal`
  (`.ps-empty`), `ink-states` (`.lane-empty`), the report specs (the read lines); fix in this PR what the pane did
  not see.
- The independent review (Codex) with no P1/P2 before merge. The base is `ui/kit-card` until #228 merges.

## Next bounded action

UIKIT-08: the Chip row of informe-30 §2.1 (`Tag` exists: state · person · key; radii on `--r-1`…`--r-4` only, where
3, 9, 10, 14 and 16 px stand loose today).
