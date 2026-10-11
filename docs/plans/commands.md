# Commands: the palette, the index of keys, one registry

> 2026-10-11 · Luis: «sigue con UIKIT-16: índice de atajos y paleta». Informe-pasada-3 §2–§5: no `?`, no `⌘K`, no
> way to a view by the keyboard; `n` and `g` do nothing; in the room any letter typed from nowhere is text for the
> message bar, so one-letter shortcuts cannot grow there. No API change.

## What was measured

- The keys a page takes are bound in nine places (`useShortcuts({ h, w, i, '/' })` in the project shell, `1 2 3 c b`
  in the Studio view, `mod+j d e shift+e` on the stage, `h p w d l t` in Places, `f`, `o`, `mod+f`, `/`), each a bare
  `{ key: fn }`: nothing knows their words, so nothing can list them. The tips on controls show a key each, when the
  control is on screen.
- `?` and `Ctrl+K` do nothing; the seven project views have no key and no way but the mouse or Tab along the bar.
- In the Studio view a `?` typed from nowhere lands in the message bar (stray typing: by design, a chat).

## What changes

- **A registry** (`app/commands.ts`, pure): a `Command` has `id`, `words` («Go to Tasks», «Microphone on»), a `group`
  (go · this view · the room · do), its `key` as `useShortcuts` names it when it has one, and `run`, undefined while the
  page cannot do it (the room not joined). `registerCommands` keeps the parts' commands in the order they came;
  `matchCommands(query, commands)` ranks by words (every word of the query starts a word of the command; matches from
  the first word first; then as registered); `indexGroups(commands, mac)` lists the keyed ones by group with the key as
  the platform writes it (`keyLabel`).
- **`useCommands(commands, enabled)`** (`app/useCommands.ts`): a part offers its commands while it is enabled and in
  scope (`ShortcutScope`): their keys are bound through `useShortcuts` as before, and the registry lists them. The
  bindings that had words to say move to it: the shell's H · W · I · `/`, plus one command per other view («Go to
  Tasks», no key); the Studio view's lenses and panels (their words say the state: «Open the brief» / «Close the
  brief»); the stage's join, microphone, camera and screen («Microphone on» / «off»).
- **The palette** (`app/Palette.tsx`, `⌘K` / `Ctrl+K`, from a field too): a dialog in the middle of the screen, the
  kit's search field over a listbox of the commands the page offers now, each with its group, words and key; typing
  narrows (`matchCommands`), ↑ ↓ move, Enter runs and closes, Escape closes and gives the focus back (`useDialog`).
  Nothing matching: one line; where the project has Search (`/`), Enter opens it.
- **The index of keys** (`app/ShortcutIndex.tsx`, `⌘/` / `Ctrl+/` from anywhere, and `?` where no field takes stray
  typing): the kit's sheet, «Keyboard shortcuts», the keyed commands by group with their keys. Generated from the same
  registry, so it never lists a key the page does not take, and changes with the view (the Studio view's lenses are
  not in Tasks' index).
- **`CommandsHost`** (`app/CommandsHost.tsx`), mounted by the project shell: binds the three keys, registers its own two
  commands («Commands» ⌘K, «Keyboard shortcuts» ⌘/), renders the palette or the index.

## States

- The palette and the index are modal dialogs over the page (the veil, Escape, Tab inside, focus back).
- A part out of scope (a project kept for its call, out of sight) offers nothing; a part gone (the Studio view left
  for Tasks) takes its commands with it.
- A command the page cannot run now is not offered (join while joined; invite for a viewer); its tip on the control
  says the key all the same.
- Phone: the palette is `min(560px, 100% − 32px)` wide; the index is the sheet as on a phone (from the bottom).

## Checks (written first)

- `commands.test.ts`: the order of parts kept and a part's removal; `matchCommands` (empty → all; «tas» → «Go to
  Tasks» first; two words; a group's word; no match → none; accents folded); `indexGroups` (groups in order, only
  keyed commands, `Ctrl+K` / `⌘K`).
- `e2e/commands.spec.ts` on the room fixture: `Ctrl+K` opens the palette with the focus in its field; «tas» → «Go to
  Tasks» first; Enter → Tasks current, palette gone; Escape closes. The palette offers the Studio view's «Open the
  brief» (Enter → «Close the brief» next time) and not in Tasks. `?` in Tasks opens the index with the keys in order;
  in the Studio view `?` is text for the message bar and `Ctrl+/` opens the index, with the lenses listed.
- Mutant: `matchCommands` returning the commands as given fails the «tas» check; the host without `registerCommands`
  fails the index.
- `pnpm check` clean.

## Left

- Places (Home · Personal · Work) keeps its `useShortcuts` bindings (`h p w d l t`, Find's `mod+f`): the host is
  not mounted there yet (the Home fixture renders Welcome alone, so a check there could not see it). Next:
  `useCommands` in Places and the host in the places' bar.
- After the review (Codex on #238): every binding inside a project is a command (Resources' and Tasks' `/` as the
  view's own search, so the project's search keeps its words there and not the key; a report's `F`; a staged report's
  `O`); the index has a visible control, «Keyboard shortcuts» in the account menu with its key, through `askCommands`;
  the palette shows a live call's switches under its veil as every sheet does (`SheetCall`); the row the keys choose
  is scrolled into the list's view, and the rows' ids are the list's own.
- The palette does not hand its query to Search: it opens Search. `ProjectSearch` would take an initial query.
- Records (a report, a task) in the palette: that is Search's (`/`), under the flag.
