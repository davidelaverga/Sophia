# Implementation-session handoff

Goal and attempt: UIKIT-32 (the room's dock in the header on the views that are not the Studio; informe-ui-premium §3
movement 7; Luis: «sigue con el dock al header»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/dock-header` from `ui/hold-stop-text` at
`e784a65e` (stacked on PR #253 → #252 → … → #220; the base retargets as each merges)
Writable scope: this worktree only (`apps/studio`, `packages/ui`, `docs/plans`, `docs/handoffs`; a contract amendment
only where its note says so), on branch `ui/dock-header`; no service code, no deploy.
Runtime unit: Luis's Windows host (the fixture dev server on :5197; Playwright through
`.claude-guards/safe-run.ps1`, 2 workers); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit stack (push to `ui/*`, answer Codex's threads with a fix
commit, cancel superseded CI runs); merges are Luis's, with no open P1. Spending: no paid service; CI minutes only.
Ending commit/tree: the branch's head as merged (`ui/dock-header`). The first delivery was `66161f90` (tree
`f5f83855827e`, 5 files); the reviewed result Codex named, `e2ced470` (tree `7aa64fb13884`), holds ten files with the
later Conversations and voice-control changes described below; every change after it is listed with its commit in the
post-review notes (Codex on #254: the record names the state delivered).

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
- After the review (Codex on #254, round 2): the floating offsets reset in the header (`inset: auto`, measured 10–38
  in the 48 px bar); with a note and her looking at once, the note comes first and her looking hangs under it.
- After the review (Codex on #254, later round): the panel takes the focus before covering the dock (`cover()`),
  `data-dock-key` names a dock control across its move (`dockKey` in ProjectShell), and the two-row header's notes
  hang under the views' row (`top: calc(100% + 54px)` at 721–760 px). dock-header.spec: the notes at 740 px; the
  focus handed to the panel when the dock floats under it.

## Remaining obligations

- Watch CI; the independent review (Codex) with no P1/P2 before merge. The base is `ui/hold-stop-text` until #253
  merges.

## Next bounded action

The Knowledge cover's paper before paint (informe-ui-premium §3 movement 4); the phone's bottom bar (movement 11);
the light in the project views when Luis looks.

## Post-review, round 4 (Codex on #254)

- In a call the connection pill yields only «Up to date»: connecting, reconnecting and catching up stay beside the dock.
- The header dock's tips open under their controls; on a coarse pointer its switches keep 40 px across.
- A side report's offset reaches only the floating dock; the header dock keeps `right: auto` and its place.
- With the header dock in sight a full or narrow report pane does not repeat the call's switches and note.
- What the dock says pushes the lobby under it (`--dock-notes-h`, kept by MiniDock from the notes' height).
- Conversations' delayed cover is one frame at a time and cancelled with the panel.
- dock-header.spec (+6) covers each; the touch width is skipped where the browser reports no coarse pointer.
