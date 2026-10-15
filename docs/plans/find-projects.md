# Finding a project: ⌘K by its name, and Work's list searched and ordered

> 2026-10-15 · Point 10 of the gaps report (`evaluacion-2026-10-15/informe-brechas-funcionales.md`): ⌘K couldn't jump
> to a project by its name, and Work's list had no field and no order. Luis: «Sí, hazlos en ese orden».

## What was measured

- The palette offers the places, Home, Personal and «Your projects» (`Places.tsx`), but no project.
- Work's list is every project, sessions soon first (`workOrder`), with nothing to find one by or order them by.

## What changes

- **⌘K opens a project by its name:** each project is a command, «Open <title>», with no key.
  - It is offered only once something typed names it (`typed` on a command), so dozens of projects never crowd the
    blank palette.
  - A project opened from there shows under Recent as any command run does.
  - The shortcut index lists keys only, so it stays as it is.
- **Work, past five projects,** gets a field, «Find a project», and an order, Next or A–Z.
  - The field finds by any part of the title, whatever its case or accents.
  - Next is Work's own order, sessions soon first. A–Z is by title as a person reads it.
  - Nothing found says so («No project is called «x»»), with Clear.
- The app's checks (`app-auth.spec.ts`) answer seven projects in place of their unavailable API.

## Checks

- `commands.test.ts`: a typed command stays out of the blank palette, is found when typed, and shows under Recent once
  run.
- `places-view.test.ts`: finding by part, case and accents; ordering A–Z and Next; finding offered from six projects.
- `app-auth.spec.ts`:
  - with seven projects, Work finds «copper», says when nothing matches, clears, and orders A–Z;
  - ⌘K names no project when blank, finds «fixture», and Enter opens it.
