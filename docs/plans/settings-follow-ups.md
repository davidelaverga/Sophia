# Settings: follow-ups to #398

> 2026-10-19 · three Codex P2s left on #398 (Settings, in one place), from the follow-up list. Studio only; no API.
> Luis 2026-10-18: «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en
> un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando». One small PR. #468 is open on
> `RoomDock.tsx`: here only `JoinButton` and one import line change; `joinTip` and the dock above it stay as they are.

## What was read (at `b89a5a962`)

- **The microphone's box in Settings keeps an old value.** `Calls` copies `micOnJoin()` into its own state once, as
  the sheet opens (`SettingsSheet.tsx:56`). While a call is live the sheet's head carries the call's switches
  (`Sheet.tsx:48`, `SheetCall`); their microphone goes through `setMicrophone`, which keeps the choice for the next
  join (`rememberMic`, `useProjectRoom.ts:280`). `mic-preference.ts` tells no one, so the box stays checked over a
  next join that leaves the microphone off.
- **Join's tip keeps the old default.** `joinTip` reads `micOnJoin()` when the dock draws Join (`RoomDock.tsx:135-140`,
  `:190`; `MiniDock.tsx:124`). Nothing draws the dock again when Settings changes the default, so «You join with your
  microphone on» stays until something else moves it. `account-settings.spec.ts:43` reloads before it looks, and
  looks at the box only; `account-settings.md` promised Join's words.
- **A sheet Settings opens closes to the page.** Passkeys and Send feedback in Settings hand over to their sheets
  (`AccountMenu.tsx:157-158`), and both sheets get the `close` a sheet the menu opened gets (`:137`, `:145-146`).
  CONTRIBUTING.md (one sheet at a time): a sheet that needs another closes and comes back after. Settings didn't come
  back.

## What changes

- **`mic-preference.ts` is a store**, as `mirror-preference.ts` and `theme.ts` are: `rememberMic` tells whoever
  listens, and `useMicOnJoin()` reads it (`useSyncExternalStore`). `micOnJoin()` stays for what reads it outside
  React (a join, `useProjectRoom.ts:152`; the device check, `DeviceCheck.tsx:131`), so `useProjectRoom.ts`, which #468
  changes, doesn't.
  - It still reads the browser's storage, as `theme.ts` does, rather than a copy held in the module as the mirror's:
    a choice made in another tab still reaches this tab's next join, as on main, and the hook hears the `storage`
    event, so the box and the tip follow that choice too.
  - Where the browser keeps nothing, the choice lasts the page, as the mirror's does. On main it was dropped while the
    box showed it taken.
- **Settings' «Join with my microphone on»** reads the hook. It holds no copy of its own.
- **Join's tip.** `JoinButton` and `MiniDock` listen (`useMicOnJoin()`), so they draw again when the default changes;
  `joinTip` reads the same value, and its lines are left alone (#468 puts the sound line right above them).
- **Back to Settings.** `AccountSheet` keeps which sheet Settings handed over to, for as long as a sheet is open.
  Closing that sheet (Close, Cancel, Escape, the veil) opens Settings again, with the focus on the press that opened
  it (`back`, `SettingsSheet`). A sheet the menu opens starts with none, so it closes to the page as before.
  - Not through the sheet's `returnTo`, as first planned: while the other sheet is open, Settings and its press are
    gone, and that sheet's opener is the avatar, where Settings gave the focus back as it closed. So Settings, opened
    again, puts the focus on the press itself, after its panel took it (`useDialog`, in the child `Sheet`, runs
    first).

## Checks, written first

- `account-settings.spec.ts`:
  - in a call (`call=on`), the sheet's own microphone switch, turned off, unchecks «Join with my microphone on» at
    once;
  - before joining, in the room (the dock) and on Tasks (the mini dock): the box unchecked and Escape, with no reload,
    and Join's tip says «You join with your microphone off».
- `crash-feedback.spec.ts`, with a DSN so Send feedback is offered: Settings, Send feedback, Close opens Settings again
  with the focus on its Send feedback; opened from the menu, Close leaves no sheet and the focus on the avatar.

## Limits

- Passkeys comes back the same way. The room fixture signs in as the dev identity, where Passkeys isn't offered, so
  only feedback is checked in a browser.
- Your data, How privacy works, Keyboard shortcuts and Sign out of all devices still leave Settings for good: they go to
  the places' own sheets or sign out (the keys were settled by a Codex P1 on #398).
