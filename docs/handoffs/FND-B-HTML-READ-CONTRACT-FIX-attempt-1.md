# Implementation-session handoff

Goal and attempt: FND-B-HTML-READ-CONTRACT-FIX-01, attempt 1. A report whose newest version a design published must
open, reload and download in the Studio, through the strict client contract.

Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`), packet `78b26c1b…`.

Allocation and census:

- Amendment A44 was allocated to this assignment alone (census `071d5aea…`).
- No SQL number was allocated.
- PR482's 0082/A43 are untouched.

Start: deployed main `26aa0507` (tree `dfff0ebe`), branch `fix/html-design-version-contract-20261025`.

## The failure

- Publishing a designed page (0040, 0041) makes a new stable version whose trigger is `{ kind: 'design', taskId }`.
- A11 declared the trigger before designs existed, as `research | rendition` only.
- The API answers `GET /api/v1/artifacts/{id}/versions` with 200: its serializer passes the kind through and drops the
  trigger properties the contract does not declare.
- The Studio's `parseArtifactVersionList` refuses the whole list, so the report pane says "The report couldn’t be
  loaded."
- The project snapshot is not affected: it carries no version notes, the trigger among them (`artifacts.ts` `notesOf`).
  This corrects the diagnosis, which had predicted a snapshot failure.

## The change

- **A44** replaces the trigger's kind enum with `research | rendition | design` and corrects its description.
- Then the normal generation: `openapi.json`, `generated-types.ts`, `validators.js`.
- Unchanged:
  - kind and taskId stay required;
  - any other kind is refused;
  - the trigger declares no new property (candidateId, reviewState, mode and sections stay undeclared).
- No SQL, no API, persistence, Studio product code, runtime or dependency change.

## Evidence (journal `B-HTML-READ-CONTRACT-FIX-01-logs`)

- **Private:** the actual captured production row (kept out of Git).
  - The 26aa validator refuses it, at `/0/trigger/kind` only. The fixed validator accepts it.
  - Both refuse an unknown kind (log 20).
- **Real PostgreSQL and API** (`design.db.test.ts`, the same final test bytes):
  - The existing design flow publishes a page.
  - `GET …/versions` and `GET …/snapshot` are parsed with the client parsers.
  - Old contract: `ContractViolation … /0/trigger/kind` (log 37). Fixed: pass (log 39).
- **Studio, Vite fixture** (`report-design-trigger.spec.ts`, lever `trigger=design|unknown`):
  - Old contract: the design report's HTML and Markdown fail to load (log 41).
  - Fixed: the HTML page opens, reloads and downloads, the Markdown reads, and an unknown kind is still refused.
  - With the report and report-origin specs, the research and rendition paths included: 68/68 (log 43).

## Deployment

- The wire already carries the value: the API serves `design` today.
- The user-visible repair is the Studio bundle with the regenerated validators.
- An API deploy only brings its contract copy in line. Its serializer does not enforce the enum, so the wire does not
  change.
- No migration.

## Limits

- The Studio witnesses run on the Vite fixture page, not on built bytes or production.
- Only the first object of the production response was captured.
- The origin line shows the design task as what the version was made for. Its wording is unchanged.
