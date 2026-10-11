# Implementation-session handoff

Goal and attempt: UIKIT-16 (commands: the palette on ⌘K, the index of keys on ⌘/ and ?, one registry), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/commands` from `ui/home-needs` at `14aed820`
(stacked on PR #237 → #236 → … → #220; the base retargets as each merges)
Ending commit/tree: `279a64fd` (tree `0427a3be89e8`): 13 files, 8 new (`app/commands.ts`, `app/commands.test.ts`,
`app/useCommands.ts`, `app/Palette.tsx`, `app/ShortcutIndex.tsx`, `app/CommandsHost.tsx`, `e2e/commands.spec.ts`,
`docs/plans/commands.md`); `ProjectShell.tsx`, `StudioShell.tsx`, `ViewNav.tsx`, `RoomStage.tsx`, `theme.css`. The
commit after it adds only this handoff.

## Outcome

- `app/commands.ts` (pure): `Command` (id, words, group go · view · room · do, key, run), `registerCommands` (parts in
  the order they came; what cannot run is not offered), `commandsNow` / `onCommands`, `matchCommands` (every word of
  the query starts a word of the command or its group; first word, later word, group; then as registered),
  `indexGroups` (keyed commands by group, keys as the platform writes them). 7 unit tests.
- `app/useCommands.ts`: a part offers its commands while enabled and in `ShortcutScope`; keys bound through
  `useShortcuts` as before; `useOffered` for the dialogs.
- `app/Palette.tsx` (⌘K / Ctrl+K, from a field too): a dialog in the middle, the kit's Search over a listbox; ↑ ↓,
  Enter, Escape, the veil; nothing matching → one line, Enter opens Search where the project has it.
- `app/ShortcutIndex.tsx` (⌘/ from anywhere, ? where no field takes stray typing): the kit's sheet «Keyboard
  shortcuts», the keyed commands by group.
- `app/CommandsHost.tsx`, mounted by the project shell: the three keys and its two commands.
- Converted: the shell's H · W · I · `/` plus «Go to <view>» for every other view (no key); the Studio view's lenses
  and panels («Open the brief» / «Close the brief»); the stage's join, microphone, camera, screen (words by state).
  `VIEW_LABEL` exported from `ViewNav.tsx`.
- `e2e/commands.spec.ts`: the palette (open in its field, «tas» → Tasks, Enter, Escape); what it offers per view and
  by state; the index on `?` in Tasks with the rows in order, `?` as text for the message bar in the Studio view and
  `Ctrl+/` from there with the lenses listed.
- Unverified here: the Playwright run (the local guard); CI is the run on record. Places (Home · Personal · Work)
  keeps its own bindings: the host is not mounted there (left, in the note).

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm typecheck`: clean. `src/app/*.test.ts`: 134 pass.
- Measured in the page (the pane at 1280×800, the room fixture): in Tasks `Ctrl+K` opens the palette (560 px wide, top
  at 128) with the focus in «Command»; it offers 12 commands (Commands, Keyboard shortcuts, Home, Your projects, six
  «Go to …», Invite someone, Search this project); «kno» leaves «Go to Knowledge» selected; Enter closes it and
  Knowledge is current. `?` (a synthetic keydown: the pane's key tool sends no «?») opens the index: Go (Home H,
  Your projects W) · Do (Commands Ctrl+K, Keyboard shortcuts Ctrl+/, Invite someone I, Search this project /), 420 px,
  the focus inside. In the Studio view `Ctrl+/` lists besides those: Converse lens 1, Explore lens 2, Build lens 3, Open
  the chat C, Open the brief B, Join the room Ctrl+J; the palette on «brief» offers «Open the brief B», Enter opens
  the panel, and the next time «Close the brief B».
- A trap met: the pane had the Build lens kept from an earlier probe, where no message bar is on screen, so `?` opened
  the index there; with the Converse lens (a fresh browser, as in CI) the bar takes it. The spec says both.

## Decisions and changes

- One registry for the keys, the palette and the index: a key never listed that the page does not take; a command
  never offered that the page cannot run (join while joined, invite for a viewer).
- `⌘K` and `⌘/` as command combinations, which act from a field too; `?` only where it can be typed as a key (the
  stray-typing rule of the room stays as it is: a chat).
- Views as commands without keys: a one-letter key in the room is text for the bar; the palette is the keyboard's way
  to a view.
- Places not converted here: the Home fixture renders Welcome alone, so no check could see the host there.

## Remaining obligations

- Watch CI for `commands.spec.ts`; the independent review (Codex) with no P1/P2 before merge. The base is
  `ui/home-needs` until #237 merges.

## Next bounded action

UIKIT-17 (Updates: mark all as seen, filters, a destination on every item; Conversations: actions per message) per
informe-pasada-3 §5, or Places onto `useCommands` with the host in the places' bar.
