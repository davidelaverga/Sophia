# Archiving a project

> 2026-10-15 · The gaps report (`evaluacion-2026-10-15/informe-brechas-funcionales.md`, point 1): a project can be
> created, renamed (A21) and left (A22), but a finished one stays in everyone's list for good. Linear, Notion and Slack
> archive: the project leaves the lists, stays readable, and an admin can bring it back. This is the last piece of
> point 1; deleting for good waits for a decision. Luis's queue, item 2.

## What changes

- **Kept in the project's row:** `projects.archived_at` (null while active). The snapshot, the mission and the runtime
  see nothing new, and an archived project can still be opened and written to.
- **Migration 0059:**
  - `sophia.set_project_archived(project, archived, key)`:
    - admins only (403);
    - idempotent per actor and key, as a rename is: the same key and choice answers the same receipt, while the same
      key with the other choice is a conflict;
    - a change emits `project.archived` or `project.unarchived`; asking for the state it already has changes nothing
      and emits nothing.
- **Contract amendment A30**, backward compatible:
  - `GET /api/v1/projects` leaves archived projects out. `ProjectSummary` doesn't change, so a Studio still open
    from before reads the list as it did.
  - `GET /api/v1/projects/archived` returns the caller's archived projects, as a `ProjectList`.
  - `POST /api/v1/projects/{projectId}/archive` takes `{ archived }` with an Idempotency-Key, and returns
    `{ projectId, archived, cursor }`.
- **Studio:**
  - The project's menu, for admins: «Archive project…» asks first. Archived, the call ends and the person goes to
    Work, as leaving does.
  - Inside an archived project, a line under the header says so. For an admin it carries «Unarchive».
  - Work: «Archived (n)» after the list, folded, shows the archived projects. Each one opens; for an admin each can
    be brought back.
  - Activity names both acts; the Work pulse labels them.
- **The sanitizer** knows both events.

## Checks

- `api.db.test.ts`, «archiving a project»:
  - an admin archives it, and it leaves every member's list for their archived list;
  - unarchiving brings it back;
  - one event per change, and none for asking again;
  - an editor, a viewer and an outsider are refused;
  - a key answers once, and only for its own choice.
- `readiness.db.test.ts`: not ready without 0059.
- `archive-project.spec.ts`:
  - an admin archives from the menu, it is recorded, and they go to Work;
  - an editor sees no Archive;
  - in an archived project the line says so, and Unarchive brings it back;
  - Work's «Archived» lists it, and it opens.
