# The places' keys as commands, and the light by a key

> 2026-10-11 · Luis: «encola las tareas». Left in `commands.md`: Places (Home · Personal · Work) kept its
> `useShortcuts` bindings, so `⌘K` and `⌘/` did nothing there and the index could not list `H P W D L T`. Informe-
> pasada-3 §5 item 11: a key for the theme. No API change.

## What was measured

- Places binds `h p w d l t` (and Find `mod+f`) as bare `{ key: fn }`; no host is mounted in the places' bar, so the
  palette and the index are a project's alone; the account menu's «Keyboard shortcuts» is shown only in a project.
- No fixture page renders Places (the Home fixture renders Welcome alone); the app's own checks (`app-auth.spec.ts`)
  reach Home signed in, with the API answered in the browser.
- A single key with Shift is the same key to `shortcutKey` (`L` is `l`): the theme's key has to be a command
  combination.

## What changes

- **Places as commands** (`usePlaceKeys` → `useCommands`, the same `free` gate): Home `H`, Personal `P`, Your
  projects `W` (go); Your data `D`, Lock / Unlock your space `L` (by the lock's state), Your notes `T` (do). Find's
  `⌘F` as «Find in the conversation». Enter on Home stays as it is (the home key's own listener).
- **The host in the places' bar** (`PlacesBar` mounts `CommandsHost`): `⌘K`, `⌘/` and `?` work at Home, in Personal
  and in Work; the account menu offers «Keyboard shortcuts» there too. A host sets itself as the one a control asks
  only while its part is in scope (`ShortcutScope`), so a project kept out of sight never answers.
- **The light by a key**: the host offers «Switch to the light page» / «Switch to the dark room» on `⌘⇧L`
  (`Ctrl+Shift+L`), by what the page shows now (`useTheme`, `resolveTheme`); it sets the choice, as the menu's radios
  do.

## States

- A sheet open over the places (`free` false): the places' commands are off, as their keys were; the host's own keys
  (`⌘K`, `⌘/`) still act from a field but not inside a dialog (`shortcutKey`).
- The lock's words follow the lock; a locked space still offers Home, Work and the unlock.
- After the review (Codex on #243): the key and its words read the root as it is shown (a `MutationObserver` on
  `data-theme`), so under «Follow the system» a system change is seen and the key toggles what is on the page.

## Checks (written first)

- `commands.spec.ts`: `Ctrl+Shift+L` on the room fixture puts the light page on the root, again the dark room, and
  the palette's words say which comes next.
- `app-auth.spec.ts`: signed in at Home, `Ctrl+K` offers Home · Personal · Your projects · Your data · Lock your space
  · Your notes; `Ctrl+/` lists them with their keys; the account menu offers «Keyboard shortcuts».
- `pnpm check` clean.

## Left

- The Home fixture renders Welcome alone; a Places fixture would let the places' commands be measured on fixtures.
