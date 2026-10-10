# Implementation-session handoff

Goal and attempt: UIKIT-05 (the kit's sixth piece: `Menu`, one menu), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/kit-menu` from `ui/kit-sheet` at `9eece859`
(stacked on PR #224 → #223 → #222 → #221 → #220; the base retargets as each merges)
Ending commit/tree: `eab4d0cb` (tree `0988ff201a25`): 15 files, 5 new (`Menu.tsx`, `menu-class.ts`,
`menu-class.test.ts`, `e2e/menu-scale.spec.ts`, `docs/plans/menu-scale.md`) and 1 moved (`usePopover.ts`, from
`apps/studio/src/app` to `packages/ui/src`). The commit after it adds only this handoff.

## Outcome

- `@sophia/ui` exports `Menu`, `MenuItem`, `MenuHead`, `MenuSep`, the pure `menuClass` / `MENU`, and `usePopover`
  with its `Popover` type (the hook is unchanged; it moved).
- The four menus render through `Menu`: the account's (`AccountMenu`), the resources' sort (`SortMenu`), the
  personal space's days (`Conversation`'s `Earlier`) and the dock's «Pass to…» (`PassMenu`, which also drops its own
  arrows and blur-out for `usePopover`). The privacy chip's answer (a dialog) stays on `.places .popover`.
- One `.menu` plane in `theme.css`; `.account-menu`, `.resource-sort-menu`, `.pass-list` and `.c3-daybar .menu` keep
  one or two lines each (a width, a place, a colour). `.menu-list`, `.resource-sort-mark` and the pass list's own
  panel and button rules are gone.
- Unverified here: the Playwright run of `menu-scale.spec.ts` (the guard keeps refusing a browser run beside the
  open game). CI is the run on record for it, and for the account's, the resources', the room's people and the
  personal space's own specs.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm typecheck`: clean (Node 24.21.0 from `~/.sophia/node`).
- `node --test "packages/ui/src/**/*.test.ts" "apps/studio/src/**/!(*.db|*.live).test.ts"`: 1046 passed (1043 + the
  3 of `menu-class.test.ts`).
- The spec's measure, run in the page (the browser pane, 1280×800, served on 5197), after the change:
  - Account: `menu menu-end account-menu`, padding 6, radius 8, the 1 px `--line-2` edge, the 18/50 shadow, the
    arrival; 6 px under its control, at its end; 230 wide; rows 32 in 13/400; every row `tabindex=-1`; the first
    focused on opening; Down focuses «How privacy works»; Escape closes and the avatar has the focus.
  - Sort: `menu menu-end resource-sort-menu`, the same plane; 6 px under its field (7 from the button inside the
    field's 1 px edge: the spec measures from the field, the control one sees); «Attention» checked, with the mark,
    focused; Down focuses «Owner»; Tab closes.
  - Pass to…: `menu menu-top menu-center pass-list`, the same plane and arrival; 6 px over its button, centred; 140
    wide; rows 32 in 13/400, the warm; Down focuses «Lucía», a press passes (`fixture.floorTo` = `['Lucía']`), the
    menu closes.
  - Days (1280×480, the list scrolled so the pill shows): `menu menu-center`, the same plane; 6 px under the pill,
    centred; 230 wide; rows 32 in 13/400 with the detail at 10.5 in the third ink; «Show earlier days» pressed
    becomes «Reading…» with `aria-disabled`, in the third ink, keeping the focus.
  - On a phone (375×812, pointer coarse): the account's rows 44, padding 6, the plane 16 from the edge.
- Mutants, with the control passing (6 px, centred): `.menu`'s offset set to 8, the measure reports 8 on the
  account's and the pass list's; `.menu-center`'s `translate` removed, the pass list measures «off».
- Before the change, the same measure: the account's 8 px under in 12 px; the sort's 6 px in 12 px; the days' in
  13 px with `.muted` at 10.5; the pass list 10 px over, a 4 px padding, a 12/32 shadow, no arrival, 13/500.
- Seen in the pane: the account menu (desktop and phone), the sort menu with its mark, the pass list over the dock,
  the days' menu under its pill.

## Decisions and changes

- `usePopover` moves into the kit: it is the menu's contract (the press outside, Escape back to the control, the
  arrows, Tab out) and has no Studio dependency, unlike `useDialog` (the shortcuts' scope), which stayed out of
  `SheetFrame`. `Menu` takes the popover and wires its panel's ref and keys itself.
- The rows' type is the body's (13 px), as the tabs' and the pills': the account's and the sort's 12 were the drift.
- The pass list's rows lose their 500 weight and their own hover tint; they keep the warm.
- Touch rows go from 40 to 44, the kit's touch size (the tabs', the format switch's, the filters').
- `menu-center` centres with the `translate` property, so the arrival's `transform` keyframe (translateY) cannot
  undo it; the days' menu did the same with `transform` and `right: auto`, now unneeded.
- The spec polls the measure (`expect.poll`) rather than waiting on the arrival's `finished`: in a hidden document
  (the pane out of view) animations and scroll events do not advance, which is also why the pane's days check
  dispatches the scroll itself.

## Remaining obligations

- Watch CI for `menu-scale.spec.ts` and the account's, the resources', the room's people and the personal space's
  specs (the pass list's blur-out is gone: a spec that relied on it would say so); fix in this PR what the pane did
  not see.
- The independent review (Codex) with no P1/P2 before merge. The base is `ui/kit-sheet` until #224 merges.

## Next bounded action

UIKIT-06: `Card` (the goal cards, the work tiles, the resource tiles, the knowledge covers), then `Skeleton`
(informe-30 §2.1).
