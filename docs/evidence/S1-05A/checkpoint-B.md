# S1-05A checkpoint B: the real API ↔ dsh boundary and one durable brief

**Recorded:** 2026-09-25, S1-05A attempt 1 (Claude Code). **Base:** `studio/qol@29a570c3`. Everything here ran in this container on Node 24.21.0, pnpm 11.7.0 and PostgreSQL 16.13. **No provider key was present: every model call went to the keyless mock (`tests/support/mock-llm.mjs`, provider `mock`, model `mock-model`). None of it is live-model evidence.**

## What now works

- **`/v1/runtime/*` is served by the API** (amendment A04): hello (lease), commands (long poll woken by `LISTEN sophia_runtime_commands`), receipts, observations and ready. Routes are authenticated by a runtime capability through an exact route list in `app.ts`. A member JWT on a runtime route is refused (401), and so is a capability on a member route. Only the capability's SHA-256 is stored (`sophia.runtime_instances`). A runtime call that carries a member identity is refused by the database itself.
- **Canonical wire types.** The shapes live in the contract (A04). The bundle's types and dependency-free validators are generated from it (`scripts/generate-runtime-wire.ts`, checked by `pnpm contracts:check`). The bridge validates every reply, each command, and each receipt and observation before queueing it. The local copy in `protocol.ts` is gone.
- **Admission through the product records** (A05): `POST /api/v1/projects/{id}/native-tasks` (`draft_brief`) creates the goal, attempt, binding, command, job and outbox rows in one transaction under an Idempotency-Key. Viewers, outsiders and guests are refused. There is no seed or demo path.
- **Seed context compiler:** a JSON manifest with the project's accepted facts (title, mission frame, accepted decisions; absent ones listed as unknown) and the chosen contributions, each by id and SHA-256. It is stored as a source; its inputs are recorded as `source_dependencies`.
- **Dispatch** (`apps/worker`, sophia_worker login) claims native deliveries (Hold/Stop first) and rechecks the goal epoch and status, the admitting actor's role, source eligibility, the runtime unit and the binding at dispatch. It then either queues exactly one runtime command (in the same transaction as the outbox result) or records an explicit `denied` with a reason. Expired leases become `outcome_unknown` and are reconciled from the database, never resent.
- **Result capture:** the last complete assistant message of a completed turn becomes a project source (`text/markdown`). The provider/model and token usage the runtime reported go into `usage_records`, and one `native_task.result_ready` event is emitted. Under Hold or Stop a late completion is **withheld**, never published.
- **Steer / Hold / Resume / Stop** on a native task go to its binding (`admit_goal_command` is replaced in 0012 only for goals with a native episode binding; the lead routes are unchanged). Delivered and incorporated are recorded as separate receipts.
- **Studio:** the Converse lens sends real attributed discussion. The draft stays local until confirmed; after an unknown outcome it retries with the same key. Editors pick up to 8 points and ask for a brief. The task's observed phase is shown, and the drafted brief opens as a labelled candidate with the model that produced it. The Work view lists briefs; Hold/Stop are their goal controls.
- **Operator path:** `scripts/register-runtime.ts` (prints a capability once) and `scripts/runtime-host.mjs` (the S1-03 supervisor bound to the real service; `--rehearse` uses the mock and says so). `pnpm dev -- --runtime rehearse|live` runs the worker and the runtime locally.

## Commands and results

| Command | Result |
|---|---|
| `pnpm check` (with `SOPHIA_DISPOSABLE_DATABASE_URL`) | exit 0 in 2 min 54 s: toolchain, Prettier, oxlint (0 findings), build, typecheck, contracts check, 122 unit tests, all runtime-unit identities reproduced, 56 integration tests (51 existing + 5 crossing) |
| `pnpm test:db` | 96 pass (86 before + 10 in `packages/persistence/src/runtime.db.test.ts`) plus 4 in `apps/api/src/runtime.db.test.ts` |
| `pnpm test:sql` | 12 migrations and the pack's SQL test pass |
| `node --test tests/integration/runtime-service.test.mjs` | 5/5: A02/A03 brief through the real service; a foreign runtime unit refused; A07 steer delivered then incorporated; A08 Stop fences and publishes nothing; A14 restart keeps the attempt and queues no second create |
| manual run: API + worker + `runtime-host.mjs --rehearse`, driven with dev tokens over HTTP | contributions → admission → dispatch → result `result_ready`, provider `mock`, model `mock-model` |

## Mutation checks (each guarantee weakened once, then restored byte for byte)

| Mutation | Caught by |
|---|---|
| M1: publish a result that arrives while the goal is stopping (withheld guard removed from `capture_native_result`) | `runtime.db.test.ts` "Stop fences the work…" fails |
| M2: dispatch without rechecking the admitting actor's role | `runtime.db.test.ts` "denies a queued delivery…" fails |
| M3: let a runtime call carry a member identity | `runtime.db.test.ts` "refuses foreign commands…" fails (after moving that assertion before the capability is revoked: it first passed for the wrong reason) |
| M4: send a JWT-looking bearer on a runtime route through member auth | not caught, by design: the route handler still refuses a request without a runtime capability (`callerOf`), so both layers must fail for a member token to reach the runtime service |

## Acceptance cases touched (see [progress](../../progress/S1-05A.md))

- **A02:** the real service exchanges hello/commands/receipts/observations/ready with the real pinned dsh; a foreign unit, command, attempt, session, revoked or unknown capability, and superseded lease are refused. **Met locally** (fixture service not involved; mock model).
- **A03:** discussion plus one idempotent brief admission through the API; no seed path. **Met locally.**
- **A04:** real-model brief. **Pending:** the mechanics are proven with the mock; the live run needs an owner allowance and `OPENAI_API_KEY` on the execution host (`runtime-host.mjs` without `--rehearse`).
- **A07 (runtime half):** steer during a model step, delivered then incorporated, with distinct evidence. **Met on the mock route**; the voice half is checkpoint C.
- **A08:** Stop during work; a late completion is withheld; the goal settles stopped; no model call follows. **Met locally.**
- **A14 (runtime half):** restart keeps attempt identity and queues no duplicate admission. **Met locally**; the Google half is checkpoint C.

## Decisions for review (Luis)

- A04 query parameters are decimal strings (the API never coerces types), as the event stream's cursor already is.
- Runtime commands and receipts are new tables (`runtime_commands`, `runtime_receipts`); outbox rows gain an `outcome_reason`, jobs an `attempt_id`/`reason`/`result_revision`, usage records a provider/model, observations a `native_seq`/`data`. Nothing in 0001–0011 is edited; `admit_goal_command` is replaced (`CREATE OR REPLACE`) only to route steer/resume of native tasks to their binding.
- The role `sophia-brief-v1` runs no native tool; the brief's inputs are in its prompt.
- The bundle archive identity changed intentionally (`config/runtime-unit.json`: `sophia_bundle.archive_sha256` `8577ffe4…` → `85ed7282…`; the dsh artifact digest is unchanged). The workspace lock identity changed with the new `apps/worker` package.
