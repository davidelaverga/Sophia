# Implementation-session handoff

Goal and attempt: UIKIT-01 (the kit in `packages/ui`, first piece: `Button` and the scale of press heights), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/kit-button` from `origin/main` at `0ccc344d`
Ending commit/tree and changed files: `c36c1d6f` (tree `6a02b1f8a887`): 18 files, 6 new (`Button.tsx`,
`button-class.ts`, `button-class.test.ts`, `e2e/control-heights.spec.ts`, `docs/plans/control-heights.md`, this
handoff). The commit after it (this PR's second) moves Conversations' three other icon presses (back, Context, its
Close) onto `Button` too and restores their shared look rule: CI's phone check found them 30×20 once the rule had
gone with New conversation's; and corrects these numbers. A third commit answers Codex's P2 on the spec: presses are
told apart by what they hold (words on one line, or a square with none), never by a height cutoff.

## Outcome

- `@sophia/ui` exports `Button` (kind × size over the classes theme.css already draws) and the pure `buttonClass`,
  `buttonHeight`, `SCALE`.
- On the thirteen fixture pages at 1280×800 and 1440×900, every visible single-line press is 24, 28, 32 or 36 px.
  Before: 13 presses off the scale, from six causes (the design note lists them). After: 0.
- Five presses render through `Button` (the goal's criteria fold, Home's microphone, New conversation, Open and Mine,
  Resources' sort); their look is unchanged, their heights are on the scale.
- Unverified here: the Playwright run of `control-heights.spec.ts` (the machine guard refused a browser run beside an
  open game: 3.2 GB free under the 6 GB floor). CI is the run on record for this spec.

## Evidence

- `pnpm format:check`, `pnpm lint` (type-aware), `pnpm typecheck`: clean.
- `node --test "packages/ui/src/**/*.test.ts" "apps/studio/src/**/!(*.db|*.live).test.ts"`: 1026 passed (the six new
  among them). `pnpm test` as a whole fails on this Windows host in `tests/unit/tree-digest.test.mjs` (EPERM on a
  symlink), before and after this change.
- The spec's measure, run in the page on each of the thirteen fixture pages served from this worktree (the same
  function the spec evaluates, read through the browser pane): presses counted / off the scale: sign-in 1/0, the door
  1/0, home 1/0, personal 11/0, the room 11/0, the room in a call 15/0, Conversations 23/0, Goals 6/0, Tasks 8/0,
  Knowledge 16/0, Updates 8/0, Resources 6/0, the work space 8/0.
- Before the change, the same measure on main's pages (probe `heights.cjs`, 1440×900): 13 off the scale on 10 pages
  (22, 26, 29, 30, 38 px).
- Control mutant, in the page: the mark's `height` rule removed, the mark measures 21 px (the measure catches it); with
  the rule, 28.
- Seen in the browser pane after the change: the bar (mark and crumb), Home's microphone, Conversations' head (+, Open,
  Mine), Resources' sort, Knowledge's card foot. No visible change beyond the heights.

## Decisions and changes

- The kit's component wraps the existing classes instead of new CSS: no visual churn, and each later migration is a
  one-line change. A size differing from the kind's own adds one modifier (`sz-sm` …); the kind's own size stays as
  it is.
- `.text-button` takes `line-height: 20px`, so an inline action is 24 px wherever its parent's line is tighter.
- The goal's controls, the lobby's answers and a proposal's answers go from 30 to 28 (the scale's nearest step); the
  sort from 38 to 32 (a ghost one step up); New conversation from 30 to 32; Open and Mine from 26 to 28; the
  microphone from 30 to 28; the crumb from 27/28 to 28.
- `packages/ui/tsconfig.json` gains `"types": ["node"]` for its first unit test.
- No API change, no fixture change, no contract change.

## Remaining obligations

- Watch CI for `control-heights.spec.ts` (desktop project); if it finds a press the pane did not (another width, a
  state a page reaches), fix it in this PR.
- The independent review (Codex) with no P1/P2 before merge, as agreed.

## Next bounded action

UIKIT-02: `Input`/`Search` (36 · 32) and `Segmented` in `@sophia/ui`, the same way: measure, one spec, the offenders
moved, the look unchanged. Then `Sheet`, `Menu`, `Card`, `Skeleton` (informe-30 §2.1).
