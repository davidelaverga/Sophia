# Implementation-session handoff

Goal and attempt: UIKIT-21 (the places' keys as commands, the host in the places' bar, the light by a key), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/places-commands` from `ui/lens-address` at
`b93d39f3` (stacked on PR #242 → #241 → … → #220; the base retargets as each merges)
Ending commit/tree: `224c065c` (tree `cef31d8bb5c5`): 9 files, 1 new (`docs/plans/places-commands.md`); `Places.tsx`,
`Find.tsx`, `PlacesBar.tsx`, `CommandsHost.tsx`, `AccountMenu.tsx`, `commands.spec.ts`, `app-auth.spec.ts`,
`docs/plans/commands.md`. The commit after it adds only this handoff.

## Outcome

- `Places`: `h p w d l t` as commands (Home · Personal · Your projects; Your data · Lock / Unlock your space by the
  lock's state · Your notes), the same `free` gate; Find's `⌘F` as «Find in the conversation». No `useShortcuts`
  binding is left outside `CommandsHost`.
- `PlacesBar` mounts `CommandsHost`: `⌘K`, `⌘/` and `?` at Home, in Personal and in Work; the account menu offers
  «Keyboard shortcuts» everywhere. A host answers a control's ask only while its part is in scope.
- The light by a key: «Switch to the light page» / «Switch to the dark room» on `⌘⇧L` (`Ctrl+Shift+L`), by what the
  page shows, setting the choice as the menu's radios do.
- `commands.spec.ts` (+1): the key puts the light page on the root and the dark room again, the palette's words say
  which comes next. `app-auth.spec.ts` (+1): signed in at Home, the palette offers the six places' commands, the
  index lists them with their keys, the account menu offers «Keyboard shortcuts».
- Unverified here: the Playwright run (the local guard); the places' commands have no fixture page (the Home fixture
  renders Welcome alone), so their measure is the app-level check in CI.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm typecheck`: clean; app + personal unit tests 254 pass.
- Measured in the page (the pane at 1280×800, the room fixture, where the project's host is): the palette on «light»
  offers «Switch to the light page Ctrl+Shift+L»; `Ctrl+Shift+L` → root `data-theme="light"`, `sophia.theme` light;
  again → the room; the account menu offers «Keyboard shortcuts».

## Decisions and changes

- `⌘⇧L`, not `Shift+L`: a single key with Shift is the same key to `shortcutKey` (L is the padlock in Places).
- The host's `askCommands` target is the host in scope: a project kept out of sight (its call going on) never answers
  the account menu's press.
- Enter on Home keeps its own listener (the home key's logic is not a command: it goes where the person last was).

## Remaining obligations

- Watch CI for `app-auth.spec.ts`'s new check and `commands.spec.ts`; the independent review (Codex) with no P1/P2
  before merge. The base is `ui/lens-address` until #242 merges.

## Next bounded action

UIKIT-22: the board's «why blocked» on the lane's head (opens the blocker) and the blocked count on the goal's chip.
