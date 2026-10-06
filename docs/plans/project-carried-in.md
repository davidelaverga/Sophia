# Project: what was carried in from Personal

> 2026-10-06 · Luis · Davide's vision, chapter 1 «Contribute», the project's side, behind the vision flag · "Continua con esos"

## The gap, measured

A note carried from Personal lands in the project (`sophia.personal_releases`), but inside the project nothing shows it. Only Personal's Work cards list it. Davide (#105): «a separately published personal contribution is now an eligible project source». The team should see what was brought to it, by whom and when, and nothing else of anyone's Personal.

## What changes

**«Carried in from Personal»,** in Knowledge, under its head and filters, with this project's reports (not with all projects'). It lists what members carried to this project, newest first (the API gives them oldest first). Each item shows:
- **The words,** exactly as carried.
- **Who and when:** «Marco, from their Personal · Oct 6»; mine reads «You, from your Personal».
- **Nothing more:** no conversation, no other note, no link into anyone's space.

**The other states:**
- **Nothing carried yet:** «Nothing carried in yet. A member can carry notes from their Personal.»
- **A read that fails:** «What was carried in can’t be read now.», with Try again. A later read that fails keeps what was read, saying «This may be out of date.», with Try again.
- **While it is read:** nothing shows, so the reports don't jump.

**The data is the existing project list** (`GET /api/v1/projects`, each project's `releases`), read as Personal's Work reads it. It needs no new API. **Only under the vision flag.**

## Checks (written first)

- **Browser** (`e2e/project-carried-in.spec.ts`):
  - Knowledge lists what was carried in, newest first though the API gives them oldest first, with who and when; mine says «You»; with all projects' reports, it isn't shown;
  - with nothing carried, it says so;
  - a read that fails says so, and Try again reads it.
