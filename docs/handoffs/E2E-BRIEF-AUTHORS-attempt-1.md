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
Ending commit/tree: `b6489625cd86` (tree `0e26ef891139`), the last commit of `api/mission-author-names`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 18 files changed against
`origin/api/discussion-author-names` at that commit: `apps/api/src/mission.db.test.ts`, `apps/api/src/routes/mission.ts`, `apps/api/src/voice-status.test.ts`, `src/features/mission/MissionPanel.tsx`, `src/features/mission/mission-view.test.ts`, `src/features/mission/mission-view.ts`, `src/features/work/GoalNotes.tsx`, `db/migrations/0049_mission_author_names.sql`, `docs/plans/mission-author-names.md`, `packages/contracts/amendments/A18-mission-author-names.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/src/generated-types.ts`, `packages/contracts/src/generated/validators.js`, `packages/persistence/src/index.ts`, `packages/persistence/src/mission-context.ts`, `packages/persistence/src/mission-rollout.db.test.ts`, `packages/persistence/src/native-tasks.ts`, `packages/persistence/src/tx.ts`. The review notes below name the commit of each later change.

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
- **Studio:** first `missionNames(known, ctx)` (`b6489625`); after Codex's P2, each record's own name as `authorLabel`'s
  fallback (see the review notes).
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

## Review notes

- **Codex P1 on #336** (`/ready` didn't require 0049):
  - `REQUIRED_SCHEMA` now requires the four name columns of 0048 and 0049.
  - `readiness.db.test.ts` walks a database through 0047, 0048 and 0049: it is not ready short of either, and ready
    with all.
  - Written first: before the change it read 200 without 0048.
- **Codex P2 on #336** (names pooled per actor):
  - `missionNames` is gone. A note, a proposal and a decision each pass the name they kept as `authorLabel`'s
    fallback, so an actor renamed between two writes reads as each one kept it.
  - `mission-view.test.ts` and `goal-notes.test.ts` cover it.
- After both:
  - The database suites pass 633/634 (the same `design.db` failure, as on main here).
  - Studio unit tests: 1219 pass.
  - Lint, typecheck and Prettier are clean.
- **Codex P1 on #336, second round** (a Studio still open from before refuses the new properties):
  - The names go only to a reader that asks: `getMission?names=1`, declared in A18. The new Studio asks for them.
  - `MissionReader.names` leaves them out of the context, and of its digest, for anyone else, the voice guide
    included.
  - `mission.db.test.ts` «names no one to a reader that doesn't ask» was written first. Before the change it found
    `authorName`, `proposedByName` and `decidedByName` in a read without the parameter.
- After it:
  - The mission, readiness and media database suites pass 32/32.
  - Studio unit tests: 1229 pass.
  - The e2e of goal notes, the goals overview, press answers and the brief pass 33/33 locally.
  - Lint, typecheck and the contracts check are clean.
