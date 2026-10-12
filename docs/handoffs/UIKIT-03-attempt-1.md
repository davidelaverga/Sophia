# Implementation-session handoff

Goal and attempt: UIKIT-03 (the kit's fourth piece: `Tabs`, one tab strip), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/kit-tabs` from `ui/kit-segmented` at
`3a464106` (stacked on PR #222 → #221 → #220; the base retargets as each merges)
Ending commit/tree and changed files: `e5cb8015` (tree `6a2c1a41dbd8`): 12 files, 6 new (`Tabs.tsx`, `tabs-class.ts`,
`tabs-class.test.ts`, `e2e/tabs-scale.spec.ts`, `docs/plans/tabs-scale.md`, this handoff). The commit after it merges
`ui/kit-segmented` forward and corrects these numbers.

## Outcome

- `@sophia/ui` exports `Tabs`: a tab list that names itself, each tab naming its panel and taking an id, the arrows,
  Home and End inside, one Tab stop for the row.
- The three underline strips render through it with one look: the Invite sheet (34 → 36, its line below kept), the
  room's side panel (36), the report viewer (38 → 36; its 2 px halo border becomes the strip's 1.5 px line, as the
  other two; its format switch moves from 3 to 2 px of margin so the row stays one line, 36 + its two borders).
- Unverified here: the Playwright run of `tabs-scale.spec.ts` (the guard keeps refusing a browser run beside the open
  game). CI is the run on record for it, and for the room's, the Invite's and the viewer's own specs.

## Evidence

- `pnpm format:check`, `pnpm lint` (type-aware), `pnpm typecheck`: clean.
- `node --test "packages/ui/src/**/*.test.ts" "apps/studio/src/**/!(*.db|*.live).test.ts"`: 1040 passed.
- The spec's measure, run in the page (the browser pane, 1280×800, served on 5197):
  - the side panel, Chat open: tabs 36, the line under «Chat» and no other, stops 0,-1; ArrowRight from Chat selects
    and focuses `side-tab-brief`, the Brief panel shows, the line moves to «Brief»;
  - the Invite sheet: tabs 36, the strip 37 with its line below, the line under «Guests», stops 0,-1,-1; End selects
    and focuses `invite-tab-calendar`, the Calendar panel shows;
  - the report viewer: tabs 36, the row 38 (36 + two borders), the format switch 32 beside it; ArrowRight from Document
    selects and focuses `report-tab-sources`, the line under «Sources 4».
- Before, on the same pages: the Invite's tabs 34, the viewer's 38 with a border for «on».
- Seen in the pane: the three strips; nothing moved but the heights and the viewer's mark.

## Decisions and changes

- `.tabs` in `theme.css` replaces the `.sheet-tabs` and `.side-tabs` button rules and the `.report-tabs button` rules
  (artifacts.css); each place keeps only its own: `.sheet-tabs` its line below, `.report-tabs` its borders and padding,
  `.report-tablist` its 18 px gap. A finger's 44 px moves to `.tabs > button` in the touch block.
- `nextInRow` leaves the three components; `app/roving.ts` stays for the goals' rail, which is a rail of cards, not a
  strip (left as it is).
- `SidePanel` renders the strip only while a panel is open (`open` is the strip's value); before, the strip rendered
  with no tab selected while closed, out of sight.

## Remaining obligations

- Watch CI for `tabs-scale.spec.ts` and the room's, the Invite's and the viewer's specs; fix in this PR what the pane
  did not see.
- The independent review (Codex) with no P1/P2 before merge. The base is `ui/kit-segmented` until #222 merges.

## Next bounded action

UIKIT-04: `Sheet` (the side sheet at 420 / 660 / full: `app/Sheet.tsx` already exists; measure the six sheets and bring
them onto one), then `Menu`, `Card`, `Skeleton` (informe-30 §2.1).
