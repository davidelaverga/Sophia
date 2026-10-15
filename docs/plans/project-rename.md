# An admin renames a project

> 2026-10-15 · Point 1 of the gaps report (`evaluacion-2026-10-15/informe-brechas-funcionales.md`): a project could be
> created and never changed; a typo in its title stayed for good. Luis: «Sigue con los puntos del informe que
> necesitan API». The point is split into small pieces: renaming first, then leaving, then archiving. Deleting for good
> touches every table a project owns, so it waits for a decision with Davide; archiving is the reversible answer.

## What was measured

- The API has `GET` and `POST /api/v1/projects` only (`routes/projects.ts`), and the Studio only creates
  (`WorkSpace.tsx`). The header says the title (`ProjectHeader`) and offers nothing on it.

## What changes

- **Migration 0051:**
  - `sophia.rename_project(project, title, key)`: an admin only (403 otherwise); a title of 1–180 characters that
    isn't spaces alone (422).
  - It is idempotent per actor and key, as `create_project` is: the same key with the same title answers the same
    receipt, and with another title it is a conflict (409).
  - It holds the project's row, bumps `projects.title_revision`, and emits `project.renamed`, so every member's feed
    reads the new title.
- **Contract amendment A21 (A19 and A20 are proposals to Davide in #105):** `POST /api/v1/projects/{projectId}/title`, with `ProjectRenameRequest` `{ title }` and
  `ProjectRenamed` `{ projectId, title, cursor }`. `/ready` requires the function.
- **Studio:**
  - For an admin, the header's title is a press that opens the kit's menu «Project». Its «Rename…» opens a sheet,
    «Rename project», with the name selected and Save.
  - A name of spaces alone isn't offered to save. Saved, the snapshot and the projects' list are read again.
  - For anyone else the title stays as it was, words alone. Leaving and archiving join the menu in their own pieces.

## Checks

- `api.db.test.ts`, «renaming a project»:
  - an admin renames, every member reads the new title, and an event is kept;
  - an editor and an outsider are refused;
  - blank, empty and too long are refused;
  - a key answers once, and only for its own title.
- `readiness.db.test.ts`: not ready without 0051.
- `project-rename.spec.ts`:
  - an admin renames from the header, and blank isn't offered;
  - at 1280 an admin's long title gives way before the views do, its chevron whole;
  - an editor sees the title alone.
