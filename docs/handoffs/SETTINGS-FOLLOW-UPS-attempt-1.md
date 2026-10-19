# Implementation-session handoff

Goal and attempt: SETTINGS-FOLLOW-UPS (three Codex P2s on #398, from the follow-up list
`evaluacion-2026-10-16/seguimientos-p2.md`, and one review P2 on this branch; Luis 2026-10-18: «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello
de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir
trabajando»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-5`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-5`, branch `settings/mic-store-and-return` from
`origin/main` (`b89a5a962`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API. Kept away from #468
(`group/seams-4`): `useProjectRoom.ts` is untouched, and in `RoomDock.tsx` only the mic import (line 17) and
`JoinButton` change; `joinTip` (lines 134-140) and the dock above it are as on main.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-18 (above); local only, nothing pushed; merges on green with no open P1 once pushed.
Ending commit/tree: `889153eb4430` (tree `53e20be04818`), the last commit of `settings/mic-store-and-return`'s own
that changes code (the next one updates only the note and this record). Files changed against `b89a5a962`:
`e2e/account-settings.spec.ts`, `e2e/crash-feedback.spec.ts`, `src/app/AccountMenu.tsx`, `src/app/SettingsSheet.tsx`,
`src/app/useDialog.ts`, `src/features/voice/MiniDock.tsx`, `src/features/voice/RoomDock.tsx`,
`src/features/voice/mic-preference.ts`, `docs/plans/settings-follow-ups.md`, and this record.

## Outcome

- In a call, turning the microphone off or on in Settings' head now moves «Join with my microphone on» at once. Before,
  the box kept the value it had when the sheet opened, the opposite of what the next join would do.
- After unchecking «Join with my microphone on» and closing Settings, Join's tip says «You join with your microphone
  off» right away, in the room's dock and in the mini dock on the other views. Before, the old words stayed until a
  reload.
- Send feedback or Passkeys opened from Settings now closes back to Settings (Close, Cancel, Escape, the veil), with
  the focus on the press that opened it. Opened from the avatar's menu, they still close to the page, the focus on the
  avatar.
- Open on the recap (or on After the meeting) puts away feedback or Passkeys from Settings for good, so the report is in
  view. Before this branch's last fix, Settings came straight back over the report (review P2).

## Evidence

- Written first, each red at its own commit before its fix (logs in the session's scratchpad `pw-logs/`):
  - `3fb3a9072` (`mic-store-red-1`): «in a call, the microphone turned off in the sheet’s head unchecks…» fails at
    `account-settings.spec.ts:64`, `expect(locator).not.toBeChecked()`, Expected: not checked, Received: checked. The
    switch itself went to `aria-pressed="false"` (line 63 passed). Fixed at `e4bbfb791`.
  - `611e4d529` (`mic-store-red-2`): «the room: … Join’s tip says so without a reload» and «Tasks: …» both fail on
    `toContainText`, Expected substring «You join with your microphone off», Received «You join with your microphone
    onCtrl+J» (the room) and «You join with your microphone on» (the mini dock). Fixed at `e81c83924`.
  - `504e297b8` (`mic-store-red-3`): «opened from Settings, Close comes back to Settings, at its Send feedback» fails
    at `crash-feedback.spec.ts:54`, `toBeFocused()`, element(s) not found: no Settings sheet. «opened from the menu,
    Close goes back to the page, at the avatar» passes there (it guards what stays). Fixed at `e062f3a91`.
  - `7c4c978a0` (`mic-store-red-5`): «opened from Settings, Open on the recap puts it away for good, so the report is
    in view» fails at `crash-feedback.spec.ts:82`, `expect(getByRole('dialog')).toHaveCount(0)`, Expected: 0,
    Received: 1; the report had opened, and the one dialog left was Settings. Fixed at `889153eb4`. (A first version
    pressed Open with the mouse and timed out, `mic-store-red-4`: the feedback sheet covers the recap, below.)
- Playwright through the guard, two workers, at `e062f3a91` (`mic-store-green-1`): account-settings, crash-feedback,
  account-menu, device-check, call-devices, call-keys, dock-header, muted-speech, push-to-talk and room: 98/98.
- At `889153eb4`, through the guard, two workers: crash-feedback, room-recap, room-return (After the meeting),
  account-settings, account-menu, sheet-frame and room, 71/71 (`mic-store-green-3`); updates-digest, room-updates,
  work, call-keys, dock-header, push-to-talk and device-check, 253/253 (`mic-store-green-4`).
- Unit: the Studio suite passes 1866/1868. The two failures are the Windows path ones on main (`attention.test.ts`,
  `browser-imports.test.ts`).
- Prettier on every touched non-docs file and `tsc --noEmit -p apps/studio` are clean. Whole-repo
  `oxlint --type-aware` reports one error, not from this branch: `useProjectRoom.ts:599`, `useRoomConnection` at 61
  lines (max 60). It is on `b89a5a962` as merged (this branch doesn't touch the file), and #468 brings it to 60 by
  inlining `startAudio`. Nothing else is reported.
- `git merge-tree --write-tree origin/group/seams-4 HEAD` merges cleanly at `889153eb4` against `fc61e4301`: no
  conflict with #468, which touches neither `useDialog.ts` nor `AccountMenu.tsx`.
- Captures at 1280×800 dark and 390×844 light, in the session's scratchpad `settings-mic-store-and-return/`
  (`*-1` and `*-2`: the call's microphone on, then off with the box unchecked; `*-3`: Join's tip «You join with your
  microphone off» after Settings; `*-4` and `*-5`: feedback from Settings, then Settings again with the focus ring on
  Send feedback; `*-6`: the recap left from feedback's call switches, drawn under it; `*-7`: Open pressed, the report in
  view and no sheet). No horizontal overflow on the page or in the sheet (0 px each, `*.json`). The throwaway specs are
  deleted.

## Decisions and changes

- **The store reads storage, not a copy.** The brief planned a module value, as `mirror-preference.ts` holds.
  `micOnJoin()` reads the browser's storage instead, as `theme.ts` does, so a choice made in another tab still reaches
  this tab's next join, as on main; the hook hears the `storage` event, so the box and the tip follow that choice too.
  Where the browser keeps nothing, the choice lasts the page (`unkept`), as the mirror's does; on main it was dropped
  while the box showed it taken.
- **`JoinButton` and `MiniDock` call `useMicOnJoin()` only to draw again.** `joinTip` reads `micOnJoin()`, the same
  value, so its lines stay as they are under #468's insertion above them.
- **Not through the sheet's `returnTo`.** While feedback or Passkeys is open, Settings and its press are unmounted, and
  that sheet's opener is the avatar (Settings gave the focus back there as it closed), so `returnTo` never runs and
  would find no press. Settings, opened again, focuses the press itself (`back`), in an effect that runs after the
  child `Sheet`'s `useDialog` focused the panel.
- **Which sheet Settings handed over to lives in `AccountSheet`.** It stays mounted while any account sheet is open and
  goes when none is, so a sheet the menu opens always starts with none; no reset is needed on the menu's items.
- **Closing every sheet gives nothing back.** `closeEveryDialog` (Open on the recap, `MeetingRecap.tsx:335`; on After
  the meeting, `AfterMeeting.tsx:54`) calls each sheet's close, the handed one's too. `useDialog` sets a flag while it
  runs (`closingEveryDialog()`), and the handed sheet's close then opens nothing. A flag rather than an argument to
  `onClose`: the kit's Close passes its click to `onClose` (`SheetFrame.tsx:64`), so every `onClose` would change type.

## Remaining obligations

- Passkeys comes back to Settings the same way, but the room fixture's dev identity isn't offered Passkeys, so only
  feedback is checked in a browser.
- Your data, How privacy works, Keyboard shortcuts and Sign out of all devices still leave Settings for good, as the
  Codex P1 on #398 settled for the keys.
- Found on the way, as on main, not changed here: the recap left from an account sheet's call switches (Settings,
  feedback, Passkeys) is drawn under that sheet while it takes the focus and the keys. The account's sheets go to
  `document.body`, after the room where the recap is, at the same `z-index: 50` (`.sheet-backdrop`). Checked at
  `b89a5a962` with a throwaway spec (`main-recap-under`): Settings from the menu, Leave the room in its head, and the
  point at the recap's title lands in Settings while the focus is in the recap. The pointer can't reach the recap; the
  keyboard can. Its own follow-up.
- The whole-repo lint error in `useProjectRoom.ts` stays until #468 merges (or a one-line fix lands there); it is
  outside this branch's scope by the brief.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1. If #468 merges first, rebase: the only shared file is
  `RoomDock.tsx`, and the hunks are apart (the import at line 17, `JoinButton` at 177).
- Source IDs consulted: none from the source register; the work read this repository and the follow-up list only.
