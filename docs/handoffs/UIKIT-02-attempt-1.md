# Implementation-session handoff

Goal and attempt: UIKIT-02a (the kit's second piece: `Field` and `Search`, and the field scale), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/kit-input` from `ui/kit-button` at `c36c1d6f`
(stacked on PR #220; it retargets to `main` when #220 merges)
Ending commit/tree and changed files: see the PR's commit; 17 files (5 new: `Field.tsx`, `Search.tsx`,
`field-class.ts`, `field-class.test.ts`, `e2e/field-scale.spec.ts`, `docs/plans/field-scale.md`).

## Outcome

- `@sophia/ui` exports `Field` (a group at 36, or 44 as a hero field) and `Search` (one look for every search), over
  the pure `fieldClass` / `searchClass` / `FIELD_SCALE`.
- Every visible input or select on the fixture pages, read as its group when in one, is 36 or 44 px. Before: the
  groups were 42 (sign-in, the door, Invite, Tasks' and Resources' searches, the find, the data sheet). After: 36, or
  44 for the three hero fields; a toolbar's search and segmented share one line (36 = 36 on Tasks and Resources).
- The four searches share one look: the magnifier in the glass, words inset 32, radius 6.
- Unverified here: the Playwright run of `field-scale.spec.ts` (the guard keeps refusing a browser run beside the open
  game; see UIKIT-01). CI is the run on record for it.

## Evidence

- `pnpm format:check`, `pnpm lint` (type-aware), `pnpm typecheck` (every package): clean.
- `node --test "packages/ui/src/**/*.test.ts" "apps/studio/src/**/!(*.db|*.live).test.ts"`: 1030 passed (the four new
  among them).
- The spec's measure, run in the page on this worktree's fixture pages (the browser pane, 1280×800): sign-in 44 (its
  press 36, its input 36), the code step 44, the door 44, personal's find 36, the Invite sheet's guest field 36 (press
  28) and members fields 36 (select 28), Conversations' filter 36 (radius 6, inset 32), Tasks' search 36 beside a
  segmented of 36, Knowledge's search 36 (inset 32), Resources' search 36 beside a segmented of 36 and a sort of 32,
  the work space 36. Nothing off the scale.
- Before, on the same pages: 42 on sign-in, the door, Tasks, Resources, the find, Invite (a border, 4, 32, 4, a border).
- Control mutant, in the page: `.field.lg`'s padding back to 4, the sign-in field measures 45 and the measure reports
  it; with the rule, 44.
- Seen in the pane: sign-in and the code step, the door, Tasks' and Resources' toolbars, Knowledge's and
  Conversations' searches, the Invite sheet (Guests, Members). The searches gained the magnifier; nothing else moved.

## Decisions and changes

- The press inside a field takes its size from the field (`.field > .pill` 28, `.field.lg > .pill` 36): no consumer
  sets `size` on a button inside a field, so a field never holds a press off its own scale.
- `.field` and `.field.lg` carry a `min-height` (36 / 44): a hero field measured 43 on sign-in by a subpixel of its
  row; the floor settles it. On a phone the group still grows with its 40 px press.
- Conversations' filter loses its raised, edgeless look for the kit's bordered search: one look for the four searches.
  Its return-to-list focus follows the box (`.conv-filter input`).
- `ResourcePanel` keeps its local `Search` component and imports the kit's as `SearchField`.
- Home's line (`.hw-say`, 46) is left as it is: a line, not a box (its height goes with Home's type scale, #213).

## Remaining obligations

- Watch CI for `field-scale.spec.ts` and `control-heights.spec.ts`; fix in this PR what the pane did not see.
- The independent review (Codex) with no P1/P2 before merge. The PR's base is `ui/kit-button` until #220 merges.

## Next bounded action

UIKIT-02b: `Segmented` in `@sophia/ui` (36 with 28 presses; a small one 32 with 24 for the report viewer's format)
and the underline tab strips (34 · 36 · 38 → 36), the same way: measure, one spec, the six segmented and three strips
moved, the look unchanged.
