# Implementation-session handoff

Goal and attempt: UIKIT-32 (the room's dock in the header on the views that are not the Studio; informe-ui-premium §3
movement 7; Luis: «sigue con el dock al header»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/dock-header` from `ui/hold-stop-text` at
`e784a65e` (stacked on PR #253 → #252 → … → #220; the base retargets as each merges)
Ending commit/tree: `66161f90` (tree `f5f83855827e`): 5 files: `ProjectShell.tsx` (`dock` slot on the header, `headerDock`, `useDockPlace`, the `floating`
prop), `app/useMedia.ts` (new), `theme.css` (the dock in the header on a wide screen), `e2e/dock-header.spec.ts` (new,
5), `docs/plans/dock-header.md`. The commit after it adds only
this handoff.

## Outcome

- On Tasks, Goals, Knowledge, Updates, Resources and Conversations the group «Project room» sits first in the
  topbar's end cluster: static, no glass, no shadow, no rise, a hairline before the connection pill, its pill 28 px
  as Invite. The same `MiniDock`: the same words, switches, group name and text-mode anchor. In a call its switches
  and Leave are in the header too. Nothing floats over the page on a wide screen.
- Under 721 px the dock keeps its fixed place at the bottom right (the phone's bottom bar is movement 11, its own
  piece).
- Unverified: the Playwright run (the local guard); CI is the run on record.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm --filter @sophia/studio typecheck`: clean.
- Measured in the page at 1280×720: Tasks, Knowledge and Tasks in a call: `position: static`, first in `.topbar-end`,
  within the topbar's box, `box-shadow: none`, the pill 28 px and Invite 28 px; in the call the words «In the room · 3»,
  «Microphone», «Leave the room». At 375×812: `position: fixed`, outside the header (the shell's child), 10 px from the
  bottom and 16 px from the right. The first mount inside the header had pinned it 731 px from the bottom: a sticky
  header with a backdrop filter is the containing block of a fixed child, hence `useDockPlace` and the `floating` prop.
- Captures: `evaluacion-2026-10-11/ui-premium/knowledge-dock-header.png`, `tasks-dock-header-call.png`.

## Decisions and changes

- A slot on the header and not a portal: the dock is part of the header's row, so it lays out with it and the four
  specs that reach it by class or group name keep passing.
- The helpers `headerDock` and `useDockPlace` outside `ProjectShell`: the shell's complexity sat at the limit.
- Mounted by width in React (`useMedia`), not by CSS alone: a fixed child cannot leave a sticky, filtered header.
- After the review (Codex on #254, 2026-10-11): the dock is nowhere on the Studio view or behind a shut door; a control
  that had the focus takes it back across the breakpoint and the Conversations' cover reaches the new dock; in the header
  the dock is `relative`, its notes hanging under the header. Three tests in dock-header.spec.
- Measured locally in a call at 1280 (2026-10-11): the live dock is 189 px wide and the views' nav lost 64 px, so
  «Resources» was clipped (press-answers.spec named it). Live, the dock says the room's state itself: the connection
  pill yields its room (`.topbar-end:has(.mini-dock[data-live]) .connection`), and the spec reads that the nav's
  scroll width is its width.

## Remaining obligations

- Watch CI; the independent review (Codex) with no P1/P2 before merge. The base is `ui/hold-stop-text` until #253
  merges.

## Next bounded action

The Knowledge cover's paper before paint (informe-ui-premium §3 movement 4); the phone's bottom bar (movement 11);
the light in the project views when Luis looks.
