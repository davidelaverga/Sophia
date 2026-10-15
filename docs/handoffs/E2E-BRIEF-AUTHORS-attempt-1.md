# Implementation-session handoff

Goal and attempt: E2E-BRIEF-AUTHORS (A18: the brief names who wrote a note and who decided, in a call or not; Luis:
«arregla notas y decisiones»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `api/mission-author-names` from
`api/discussion-author-names` (#334, `ac5d825a`), which it builds on (`withAuthors`, migration 0048)
Writable scope: this worktree only (`db/migrations`, `packages/contracts`, `packages/persistence`, `apps/api`,
`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host (the database suites through `scripts/with-postgres.ts`; the real dev stack for the
browser check); CI as the run on record.
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: pending

## Outcome

- **Migration 0049:**
  - Adds `mission_entries.author_name`, and `decisions.proposed_by_name` and `decided_by_name`.
  - Triggers keep the name the API puts in the transaction (`sophia.actor_name`), for the transaction's own actor
    (`sophia.actor_id`) only. They overwrite whatever a write sets. An update keeps the names already kept, and
    `decided_by_name` changes only with `decided_by`.
  - The triggers are SECURITY DEFINER, and their helper `transaction_actor_name` is not executable by PUBLIC: the
    schema's rule.
- **Persistence and API:**
  - `nameActor(c, name)` in `tx.ts`. `submitContribution` now uses it too.
  - The mission routes for a note, a correction, a proposal and a decision write through `asMember`, which names the
    member from their token.
  - `readMissionContext` returns the names.
- **Contract amendment A18:** `MissionEntry.authorName`, `MissionDecision.proposedByName` and `decidedByName`. Contracts
  regenerated.
- **Studio:** `missionNames(known, ctx)` in `mission-view.ts`. The brief panel and a goal's notes use it.
- **Voice guide:** `project_status` keeps naming people only as who they are to the speaker. A test now holds it.
- **`mission-rollout.db.test.ts`:** it reads with today's reader, so it now brings the 0020 database to today's schema
  before reading (`migrateOnward`).

## Evidence

- Plan: `docs/plans/mission-author-names.md`.
- Written first and failing (commit `e73c6ced`):
  - `mission.db.test.ts` «who wrote a note and who decided»: `authorName` was undefined.
  - `mission-view.test.ts` «outside a call»: there was no `missionNames`.
  - `voice-status.test.ts` «names no one» passed before and after: it guards the guide.
- After:
  - The database suites pass 633/634 on PostgreSQL 16. The one failure is `design.db.test.ts`, which fails the same
    two cases on main here (the Windows host). The first run caught two failures that are now fixed:
    - the helper was executable by PUBLIC (`personal.db.test.ts`);
    - the rollout test read 0049's columns from a database at 0020.
  - Unit tests for the Studio, the API and persistence: 1323 pass. The 12 failures are `byte-backup*.test.ts` (file
    permissions on Windows), which this branch doesn't touch.
  - Type-aware lint over the whole repo, Prettier, typecheck and the contracts check are clean.
- Browser check on the real dev stack with this branch (`verify-a18.cjs`), nobody in the call. Davide wrote a note and
  two proposals with his own token, and Luis accepted one.
  - Luis's brief read «observed · typed · Davide» and «Proposed by Davide».
  - Davide's read «Accepted Constraint: Signs at the door. Luis, in the Studio».
  - No address and no «A member» in either.

## Remaining obligations

- CI; Codex with no open P1. Retarget to `main` once #334 merges. Voice writes keep no name: the plan's «Left» says
  how they would follow.
