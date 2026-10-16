# Implementation-session handoff

Goal and attempt: FND-C2-ATTENTION C2a (#365 section 2, serve A15's Needs), attempt 1
Human owner / executor resource: Davide (assignment, relayed from P) and Luis (UI, merge) / Claude Code lane C, session
`local_557a0040-996c-4a7f-874d-01449e49b493`
Native session: as above
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-attention`, branch
`api/attention-20261016` from the sealed profile head `7fc748c4332dcfebb458e901c3eda35273e628df` (#388 on #386)
Writable scope:
- new isolated modules: the needs migration (`0065`, P's allocation rev3), its persistence, route, tests and plan;
- the small registrations in `app.ts`, `readiness.db.test.ts` and the persistence index, for B to reconcile.

No contract or generated output; no Studio file.
Runtime unit: Davide's macOS host; local PostgreSQL 17.11 (V's recipe, C's port 55498, fresh clusters stopped after);
CI's PostgreSQL 16 is the run on record. Production is 17.6 and was not touched.
Existing authority: P's FND-C2a START (namespace rev3), relayed by Davide.
Ending commit/tree: the commit this record is in (one commit; head and tree in the PR and in C-attention-handback.txt).

## Outcome

- `GET /api/v1/me/needs` and `POST /api/v1/me/needs/{id}/seen` are served as A15 states them.
  - **Decisions** whose decider is the caller, open and not expired. They leave only when answered, expired or
    superseded.
  - **Guests** waiting where the caller can let them in (editors and admins, not viewers). They leave when decided.
  - **Sophia's replies** after the seen mark.
  - **Permissions:** none; no record keeps a native request.
- The seen POST moves a reply's mark forward to the turn named, and is the only transition. Another kind's seen
  changes nothing. An id naming no need of the caller is 404.
- **Not verified:** the Studio against the served route (its switch is Luis's, after the deploy), production and live
  accounts.

## Evidence

- **`needs.db.test.ts`, 7 cases:**
  - decisions: own, others', expired, answered; seen is not answered;
  - guests: rights, viewer, outsider, guest token, decided;
  - replies: a later turn of the person's, a space read and a list read acknowledge nothing; forward only;
    idempotent; another person 404 or empty; late reply new;
  - erasure: erased replies gone, an erased id 404, a late reply after it new;
  - ids: malformed and foreign ids;
  - membership: left member, archived project, an empty answer;
  - escaping.
- **On local PostgreSQL 17.11:**
  - needs + readiness (with the rollout backfill on a space made before 0065) + personal: 37 of 37;
  - before the rename and the last two cases, every `apps/api` and `packages/persistence` `.db` test: 595 of 595,
    0 skipped.
- `pnpm format:check`, `lint`, `typecheck`, `contracts:check` (unchanged); API unit tests 123 of 123.

## Decisions and changes

- **The seen mark:** only the seen POST moves it. At rollout, once, existing spaces start at their person's last turn
  (Codex on #390: a later turn must acknowledge nothing). The turn order survives erasure, so the mark stays valid.
- **For the Studio:** a reply read in the personal space stays a need until a seen POST names it. The space would post
  seen for the newest reply in sight (docs/plans/needs-served.md).
- **The id** is A15's, each part escaped (`%`, `:`), so it is injective.
- **Found:** Fastify's default `maxParamLength` (100) answered 414 to a decision's seen POST. `buildApp` sets 2000.
- **404 by the route:** A15 declares 404 for an unknown need, while the house `not_found` code is 422.

## Remaining obligations

- **B:** reconcile the `app.ts` registration, `REQUIRED_SCHEMA` and `routerOptions`, the readiness step and the
  persistence export in the combined source.
- **Luis:** the needs-only Studio switch (docs/plans/needs-served.md), after V deploys.
- **C2b (Updates):** `0066_project_updates.sql` and `A34-project-updates.json`, reserved. It starts after this head
  seals, with P's generated-output slot.

## Next bounded action

- P/V review the draft PR.
- Then C2b, on P's go.
