# Implementation-session handoff

Goal and attempt: FND-C2-ATTENTION C2b (#365 section 2, #105: event-backed Updates and the member's seen mark), attempt 1
Human owner / executor resource: Davide (assignment, relayed from P) and Luis (UI, merge) / Claude Code lane C, session
`local_557a0040-996c-4a7f-874d-01449e49b493`
Native session: as above
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-updates`, branch `api/updates-20261016`
from the sealed C2a head `a6f1f86aff3f67eab718cda04fd804d20e734fb5` (#390)
Writable scope:
- `0066_project_updates.sql`, `A34-project-updates.json` and its generated outputs (P's slot, held until this head
  seals);
- new persistence and route modules, their tests and plan;
- the small registrations in `app.ts`, `readiness.db.test.ts` and the persistence index, for B.

No Studio file.
Runtime unit: Davide's macOS host; local PostgreSQL 17.11 (V's recipe, port 55498, fresh clusters stopped after); CI's
PostgreSQL 16 on record.
Existing authority: P's FND-C2b START (C2b-updates-packet-v1.txt), relayed by Davide.
Ending commit/tree: the commit this record is in (head and tree in the PR and in C-updates-handback.txt).

## Outcome

- `GET /projects/{id}/since` serves the member's bounded window as current records (decided, made, noted, open, work,
  names), with `more`.
- `PUT /projects/{id}/seen` moves the mark forward, to a shown `toSequence`, never past the newest event.
- Reading acknowledges nothing; events after the shown bound stay new.
- Withdrawn, superseded and unreadable records are in no line or count. Private events stay private.
- **Not verified:** the Studio against the route (its switch is B's, after V's deploy), production and live accounts.

## Evidence

- **`updates.db.test.ts`**, 6 cases: sections and names; viewer, outsider and removed access; the shown bound with a
  newer event, replay, an older value, a value ahead (422), marks per member; the bounded window and the next one;
  withdrawn note and source, a private event; archived; Needs untouched.
- **Local PostgreSQL 17.11:** every `apps/api` and `packages/persistence` `.db` test, 602 of 602, 0 skipped.
- **Static:** `format:check`, `lint`, `typecheck` and `contracts:check` (the generator's output for A34).
- **Units** after `pnpm build`: 2419, 2349 pass, 70 environment skips, 0 fail.

## Decisions and changes

- **The digest is the Studio's proposed shape** (`api/vision.ts` `Digest`), with what the service can say truthfully:
  nullable people and `at`, and `more`.
- **Lines come from current records**, reached through the window's events. Text comes only from a source that is still
  ready and eligible.
- **The window:** at most 500 events on from the mark; the next window starts where the shown one ended.

## Remaining obligations

- **B:** the Studio activation (docs/plans/project-updates.md: the parser, `more`, the Meetings half behind VISION, the
  switch after the deploy). Also reconcile the registrations and regenerate the combined contracts.
- **Slot:** C holds the generated-output slot until this head seals; then it is released to B.

## Next bounded action

- P/V review the draft PR.
- B integrates.
- C3 (mentions and correction) is a separate next packet.
