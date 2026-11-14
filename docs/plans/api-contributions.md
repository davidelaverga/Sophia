# Member API contributions for Explore (INC01-CC-004 S5-a): records, admission and fences

This plan was written before the code it describes. It covers SOPHIA-INC-2026-11 INC-01 slice S5 (R05–R13, R18), the
contracts C01, C02 §5 and C03 §3–5, and migration `0094_api_contributions`. It implements the preflight
INC01-CC-004-PREFLIGHT (SHA-256 `21f49d71…`) with the coordinator's corrections.

## Scope

**Built on.** The fixed development base `db414c02` (PR505 head). That base is *not* an accepted parent: it carries
three open SQL findings in inherited 0092 code, which this slice neither touches nor repairs.

**What it adds.** One owner-funded research runtime per contribution:

- It is operator-hosted, on the existing pinned unit, role `sophia-research-md-v1` and route `research-sol-medium-v1`.
- It produces Markdown only.
- It is registered as its own dsh executor resource. Its process holds the owner's key under the route's existing
  reference name `OPENAI_RESEARCH_API_KEY`.

**What is unchanged.** No new agent loop, broker, runtime model route, key intake or provider call. No bundle,
runtime-unit, specialist, API route, contract, generated type, UI or worker change.

**Exclusive files.** Seven new paths. No existing file is edited:

- `db/migrations/0094_api_contributions.sql` and `db/tests/0094_api_contributions.sql`
- `packages/persistence/src/api-contributions.ts` and `api-contributions.db.test.ts`
- `scripts/register-contribution-runtime.ts`
- this plan
- `docs/handoffs/INC01-CC-004.md`

**Off by default.** Nothing here makes a contribution usable. Use needs all of these:

1. an operator registration of a contribution runtime;
2. a current route qualification (operator-only; none exists anywhere);
3. an owner's grant;
4. a requester's explicit funding pin.

## Who pays which meter

| Meter | Payer | Bounded by |
|---|---|---|
| Model calls (`kind='model'`, provider `openai-research`) of a contributed task | The contributor's API account, through the key in the contribution runtime's host | Owner's grant task cap and total cap; the account's total cap; the project's per-task allowance (unchanged) |
| Search and read (Tavily, Jina) of a contributed task | The project's existing research payer, the operator's keys on the same host | The project research gate (`research_grants`) and allowance, exactly as today |
| Everything of an unpinned task | Unchanged | Unchanged |

So the owner does **not** pay every meter, and the project research gate must also be enabled.

The project's total cap (`research_grants.total_cap_usd`) no longer counts contributed model spend, because the
project does not pay for it. Every other part of the project total is unchanged.

The caps are the owner's **authorization of Sophia-metered spend**. They are not a provider balance or benefit, and not
a provider-side hard budget. Provider balance, benefit linkage, organization identity and usage reporting are
**unknown** and never shown.

## Records (0094)

All tables have RLS enabled, no policy and no table grant. Every access goes through `SECURITY DEFINER` functions,
which derive the actor (`sophia.actor_id()`) or require the worker or migration-owner role.

| Table | Purpose and key rules |
|---|---|
| `api_accounts` | The accounting root. Columns: owner, provider `openai`, category `api`, safe label, provenance (`owner_declared` or `unknown`; `provider_verified` is not allowed in this slice), `concurrency_limit` (1–3, default 1), `total_cap_usd`, revision. **At most one account per owner and provider**, unless the owner records `separate_ownership_note`. Aliases are therefore one root by default. |
| `api_connections` | The C01 `resource_connection` for an API route. Columns: owner and account; the route and its pinned model and effort (constants checked against `config/runtime-unit.json` by tests and by the CLI); `credential_ref` (the reference *name* only); `credential_revision`; custodian kind `operator_runtime_host` and a safe custodian label; state (`draft`, `connected`, `paused`, `revoked`); revision. **No key value, fingerprint, provider billing ID or token hash.** |
| `api_route_qualifications` | Operator record (migration owner only) that a route, model and effort is qualified, with an evidence reference, expiry and revocation. **None exists in production; S5-a creates none.** |
| `api_contribution_grants` | One row per selected project (the C01 `resource_grant`). Columns: connection, owner, project; revision (every edit needs the expected revision); state (`enabled`, `paused`, `revoked`) and `expires_at`; operation `research`, output `markdown`, role, route, model and effort pin; eligible requesters (`editors`: every current editor or admin; or `listed`: an explicit actor list, each still needing current editor or admin membership); `task_cap_usd`, `total_cap_usd`, concurrency (≤ the account's); unknown-usage policy `hold_uncertain`; funding policy `bounded_total_spend` with an acknowledgement reference; active-settlement policy `block_new_calls`; `admin_disabled_at`, `admin_disabled_by` and a reason. Private by default: no row means no use. |
| `api_contribution_runtimes` | Links an executor resource and runtime instance to a connection and its credential revision in one project. State `current` or `draining`. This table *is* the definition of "contribution resource". |
| `research_funding_pins` | A requester's explicit, server-held choice of a grant, and the grant revision they saw, per project. The model never names a payer. |
| `api_contribution_tasks` | The frozen binding of a contributed research task. Columns: grant and grant revision, connection and credential revision, account, owner, requester, resource; requested settings (route, model, effort). Accepted and observed settings are **not** stored: they are unknown. |
| `api_contribution_reservations` | Links each model reservation of a contributed task to its grant, revision, account and credential revision. Amounts are not copied: they are read from `research_reservations`, so settlement stays single-sourced and idempotent through the existing settle. |

## Crossings

### Owner, admin, member and operator

- **Owner (via `withActor`).** Create or edit their account, with the expected revision. Create a connection (`draft`).
  Pause, resume or revoke a connection. Create, edit, pause, resume or revoke a grant in a project they are an active
  member of. Only the owner may enlarge.
- **Project admin (not the owner).**
  - `admin_disable` and `admin_lift` a grant in their project.
  - `admin_narrow` it: lower caps, earlier expiry, or remove listed requesters.
  - Each needs the expected revision. Admins can never enlarge.
- **Member.** Set or clear their own pin to an enabled grant they are eligible for, at its current revision.
- **Teammate view.** The safe projection for project members:
  - the permitted grant's owner, label, route, model and effort, caps, expiry, state and readiness reasons;
  - never the account's totals, other projects or other members' pins.
- **Operator (`register_contribution_runtime`, migration owner).** Registers a runtime for one project, at the
  connection's current credential revision:
  - with `p_rotate`, it advances `credential_revision` first and marks every existing link `draining`;
  - it creates or reuses the executor resource for that project, connection and revision;
  - it replaces any active token of that resource and unit;
  - it sets the connection to `connected` (custody registered, **not** verified).

### Admission (`admit_research_task`, replaced)

- **No pin.** Exactly as today. The runtime choice adds `NOT sophia.contribution_resource(…)`, so a contribution
  runtime is never chosen.
- **Pin.** Every check below is made under the project lock, then the account lock. Any failure raises a typed refusal
  (`55000`, or `42501` for authority) and admits nothing. It **never falls back to the project payer**.
  1. **Shape.** The role is `sophia-research-md-v1`, the outputs are exactly `["markdown"]`, and the route is the
     grant's.
  2. **Grant.** It exists in this project, is enabled, unexpired and not admin-disabled, and its revision equals the
     pin's.
  3. **People.** The requester is eligible. The owner is an active member of the project (source disclosure goes to
     the owner's provider account).
  4. **Connection.** It is `connected`.
  5. **Qualification.** A current route qualification exists.
  6. **Runtime.** A `current` contribution runtime of this connection revision is available in the project with the
     role and route.
  7. **Concurrency.** The account has a free slot. Slots are counted across all projects and aliases: an active
     contributed task, or a reserved or uncertain model reservation, holds one. The grant's own concurrency is also
     enforced.
  8. **Amendments.** An amendment keeps its lineage's funding: same grant, or both unpinned.
  9. **Idempotency.** The grant ID and revision are added to the semantic hash, so the same key under another pin or
     revision conflicts (`23505`). Unpinned semantics are byte-identical to today, so legacy replays still match.

### Dispatch: judged at dispatch, and fenced by the change (r2)

`native_delivery_ineligible` and `dispatch_runtime_outbox` are pinned byte-for-byte by an existing invariant suite
(`conversation-runtime.db.test.ts`), so the recheck lives in what dispatch already calls for new work, both unpinned
and replaced in 0094:

1. **`runtime_unavailable(rt)`.** Dispatch reads it for every queued create, resume and steer (never for a stop, hold
   or retire), under the project lock it holds. For a contribution runtime it now also reports
   `contribution_runtime_unusable`:
   - the runtime link is not `current`;
   - the connection is not `connected`, or its credential revision moved;
   - the grant is unusable (revoked, admin-disabled, paused, or **expired by time alone**);
   - the owner is not a member;
   - the route qualification is withdrawn or **expired**;
   - or any queued new work for it fails `contribution_delivery_ineligible`.

   A legacy runtime's answer is unchanged.
2. **`defer_native_delivery`.** A contributed delivery whose own current authority fails
   (`contribution_delivery_ineligible`, which now includes the route qualification) is **denied**, not deferred. The
   job is cancelled `not dispatched: …`, nothing is sent, and its account slot is free. A delivery that only waits
   behind another task's stale row is deferred, visibly. Legacy deferral is unchanged.

The check covers:

- grant state, expiry, admin disable and revision;
- requester eligibility and owner membership;
- connection, credential revision and runtime link;
- route qualification;
- and, through the existing check, source and attempt eligibility.

In addition, the change that makes a queued delivery ineligible still denies it in its own transaction, through
`deny_native_delivery`: a grant, connection, runtime-link or membership change. Every such change takes the project
lock(s) first (see "Lock order"). Stop and retire are never fenced. A dispatch that committed first stays a possible
send, under its original payer and revision. `contribution_runtime_of` (admission and readiness) reads only the
runtime's own connection. Its authority is checked explicitly, so readiness keeps one reason per failure.

### Each new paid model reservation (`reserve_research`, replaced)

For a contributed lineage and `kind='model'` only, the contribution checks run after the existing checks and locks:

- the grant is enabled, unexpired, not admin-disabled and at the bound revision;
- the requester and owner are still members (their member rows are locked `FOR SHARE`);
- the connection is `connected` at the bound credential revision;
- the provider is `openai-research`;
- three caps hold: grant task cap (by lineage), grant total and account total.

**When "now" is (r3).** A grant's expiry and a route qualification are judged at the **wall clock** when the check
runs (`clock_timestamp()`), never at the transaction's start: `contribution_grant_unusable` and
`contribution_route_qualified` (and the helpers built on them) are `VOLATILE`. Each new effect makes its time-bound
decision after its **last** lock wait:

- **Dispatch** evaluates `runtime_unavailable` and the per-task check after its project, outbox, goal, command and
  binding locks, in a statement with a fresh snapshot.
- **Admission** rechecks grant expiry and qualification after the account `FOR UPDATE`, before the task, outbox or
  binding is written.
- **A new paid model reservation** rechecks them after the account `FOR UPDATE` and the caps. `reserve_research` then
  writes the reservation under locks already held, so there is no further wait.

A refusal writes no command, task or reservation, and there is no fallback payer. A replay of an existing reservation
key returns the original and is never re-judged, so history and uncertain commitments stay truthful. A command already
enqueued under valid authority is an already-possible effect (`block_new_calls`): the runtime poll is unchanged, and
its first new paid model call is refused at reservation.

The reservation is linked in `api_contribution_reservations`. Search and read keep exactly today's checks and payer.
Unpinned reservations are unchanged, apart from the project total excluding contributed model commitments (zero when
none exist).

### Settlement

`runtime_research_settle` is **unchanged**. Commitments are read from `research_reservations`:

- `reserved` counts its reserved amount;
- `settled` counts its settled amount;
- `uncertain` counts its reserved amount, and **holds the account slot and the caps until reconciled**;
- `released` counts nothing.

There is no early release, and no reconciliation of `uncertain` is added here (see the handoff).

### Delayed publication (`runtime_research_submit`, replaced)

For a contributed task, a submitted *result* is published only if all of these still hold:

- the requester is eligible and an editor or admin;
- the owner is a member;
- the grant is not revoked or admin-disabled.

The existing scope fence (goal epoch, task state, binding; source withdrawal revokes the attempt) still applies first.
If the recheck fails, the result is **withheld**:

- the job fails with reason `withheld: …`;
- nothing is published;
- the draft already stored in `research_drafts` is kept as restricted evidence;
- a replay of the same call returns `withheld`.

A blocker is recorded as today. Unpinned tasks are unchanged.

**What may still publish (`block_new_calls`, r2).** A result already authorized and possible is **published** after a
pause, a time-only expiry, a revision change or a credential rotation, under the payer, grant revision and credential
revision it was made under. It is **withheld** after a revoke or admin disable, when the requester or owner is no
longer a member, or when a source it read was withdrawn. The same text is the module's `BLOCK_NEW_CALLS_POLICY`, and
the operator CLI prints it on rotation.

### Legacy pickers (exclusion)

Each picker gains `NOT sophia.contribution_resource(project, resource)`. Each body is otherwise byte-identical to its
latest definition.

| Function | Latest definition | Used by |
|---|---|---|
| `register_runtime` | 0012 | The project dsh resource. It can never reuse a contribution resource. |
| `role_runtime` | 0039 | The designer and visual review |
| `work_runtime` | 0042 | Source review |
| `source_review_availability` | 0083 | Source review |
| `admit_native_task` | 0016 | Retired in the API, but still callable in SQL. It picked the **newest active runtime with no role filter**: a contribution runtime registered later would have been chosen. |
| `conversation_ask` | 0071 | Conversation. **Not replaced**: existing suites pin its body byte-for-byte. Excluded structurally instead, see below. |
| `conversation_ask_capability` | 0089 | Conversation. Not replaced, for the same reason. |
| `admit_research_task` | (above) | Research |

**Structural exclusion.** A trigger on `runtime_instances` limits a contribution runtime's stored roles to the one
contributed role, whatever its hello advertises. So no role-filtered picker can ever choose it: not conversation,
design, visual review or source review. This is an enforced invariant, not a role or digest coincidence. The explicit
predicate is still added wherever the definition is not pinned.

The SQL test enumerates `pg_proc`. Every function whose body selects `runtime_instances` must be one of:

- an excluding picker;
- a pinned role-filtered picker, with the trigger present;
- a known binding- or token-scoped function.

A new, unclassified selector fails it.

## Lock order

One order for every path (r2): **project(s) → task → authority → outbox → account**. A path takes only the prefix it
needs, and never a step out of order.

1. `projects` (`FOR UPDATE`). Admission and dispatch hold it. So does every runtime research call (reserve, settle,
   submit), through `runtime_lease`. Every member change (`remove_member`, `leave_project`, `change_member_role`)
   holds it too. So does every contribution change that may fence:
   - grant edits (`contribution_grant_for_edit`);
   - **first-grant creation** (`api_grant_create`, r3). It locks the project, then the connection, then performs the
     insert's own references, and checks ownership and membership under both locks. A registered runtime link already
     puts the project in every connection change's set, so the old connection-then-project order deadlocked (`40P01`)
     against a connection pause or a rotation.
   - **multi-project** connection state changes and registration/rotation (`contribution_lock_connection`). These
     lock every project of the connection's grants and runtime links, **sorted by id**, then the connection. They
     recheck that set under the connection lock, and refuse with `40001` if a project gained a grant or link
     meanwhile, rather than lock a project out of order.
2. The task: `research_tasks` (reserve, publish), and the goal held by the research scope.
3. Authority:
   - `research_grants` and `research_allowances`;
   - `project_members` (`FOR SHARE`, requester then owner, by actor id);
   - `api_contribution_grants` (`FOR SHARE` on use, `FOR UPDATE` on edit);
   - `api_connections` (`FOR SHARE` on use, `FOR UPDATE` on state and rotation);
   - the runtime links.
4. Outbox rows (the fence's `FOR UPDATE`, dispatch's own row), then commands, bindings, attempts and jobs.
   `emit_service_event` updates the project row already held.
5. `api_accounts` (`FOR UPDATE` on admission and reservation).

The changes that could form cycles in r1 (each a two-client test with real `withActor`, a held transaction, bounded
waits and no deadlock retry):

- pause, revoke and admin disable;
- connection pause;
- registration and rotation across two projects.

Each now waits behind a held admission and then fences, instead of failing with `40P01`. A fence that succeeds is
atomic with its change. r3 adds first-grant creation, after registration, against a connection pause and a rotation.

**Sibling audit (r3):**

- `research_funding_pin_set` takes only the grant `FOR SHARE`, then inserts the pin. It takes nothing a grant edit
  waits for in the other order.
- `api_account_update` takes only the account.
- `api_connection_create` references the account. An admission holding the account takes nothing from it.
- `retire_contribution_runtime` takes a draining link, then its runtime row. Registration updates only `current`
  links, then runtime rows: the same order, so there is no cycle.
- None of these needs a new lock. Each finding is stated, not assumed.

**Two projects, one last slot.** Each admission holds its own project lock and then waits on the same account row. The
second sees the first's committed task, and refuses with `account_busy`.

**Revoke against reserve.** A reserve holding the grant `FOR SHARE` commits first: that call is possible and is
settled truthfully. Every reserve after the revoke refuses.

## Active settlement, stated truthfully

The only policy supported is `block_new_calls` (`BLOCK_NEW_CALLS_POLICY`). It applies once authority fails: on pause,
revoke, expiry by time, admin disable, revision change, membership loss, credential rotation, or a withdrawn or
expired route qualification. This slice guarantees:

1. **No new dispatch.** Queued create, resume and steer deliveries are denied, at the change and again at dispatch.
2. **No new paid model call.** No new reservation is made.
3. **Delayed publication** (above). An already-authorized, possible output may publish under its original payer and
   revision. It is **withheld** for revoke, admin disable, a requester or owner who left, or a withdrawn source.

What it does **not** guarantee:

- A provider request already reserved may still complete. It settles, or stays uncertain, under its original grant,
  revision, account and credential revision.
- An active session is **not** stopped. No qualified Stop or finish control exists for contribution runtimes, so `stop`
  and `finish` are refused as unsupported grant policies.

Blocking new calls does not complete an active effect, and nothing here claims it does. The existing goal Hold and
Stop, used by an authorized member, are unchanged and separate. They are still delivered to a contribution runtime
whose grant has expired.

## Rotation and custody

Re-registration with `p_rotate` advances `credential_revision`:

- **Old runtimes.** They become `draining`. They are never chosen and get no new paid model reservation, but their
  tokens still authenticate, so pending reservations can settle and reconcile under their original revision and payer.
- **Retiring them.** `retire_contribution_runtime` (operator) revokes a drained token. Its unresolved commitments stay
  counted.

**Not detectable.** A key swapped in the host environment without re-registration. Sophia cannot observe key identity,
so that custody procedure is **unqualified**.

## Settings

| Setting | Recorded as |
|---|---|
| Requested | The grant pin: route `research-sol-medium-v1`, model `gpt-6.1-sol`, effort `medium` |
| Accepted | `unknown`: no adapter-accepted identity is recorded for research |
| Observed | Kept separately. `unknown` unless a settled model reservation's `usage.model` reports it. Never copied from the request. |

The route is `live_verified: false`, so it is unqualified until a qualification record exists.

## Tests (fake and disposable only)

- **SQL** (`db/tests/0094`, rolled back): RLS, grants, the single-account rule, revision rules, admin cannot enlarge,
  unsupported policies refused, and the picker exclusion.
- **DB** (`api-contributions.db.test.ts`, real PG16 with `withActor` and the real admission, dispatch, reserve, settle
  and submit functions; runtime calls made with the runtime token, no provider):
  - preflight cases 3.1–3.10;
  - wrong owner or project; RLS and teammate privacy; stale expected revision;
  - eligible other-member admission;
  - every legacy exclusion, plus the `pg_proc` inventory;
  - dispatch, reserve and publish fences on grant, membership and source;
  - rotation, with settlement under the old revision;
  - unknown commitments with no early release;
  - no fallback when pinned; per-meter attribution;
  - same-key semantic changes, concurrent calls, idempotent settlement;
  - the two-project last-slot race, with bounded waits;
  - r2: dispatch-time denial after a time-only expiry and after a withdrawn or expired qualification (account slot
    freed), and the same denial with every change fence disabled, for each changed row;
  - r2: a Stop still delivered, and a legacy defer unchanged;
  - r2: pause, admin disable, connection pause and two-project rotation, each against a held admission;
  - r2: publication holds no member or grant lock while the project is held;
  - r2: published versus withheld siblings across the `block_new_calls` cases;
  - r2: the CLI projecting the policy;
  - r3: dispatch across a grant or qualification expiry while waiting on the project; a new paid model call across an
    expiry while waiting on the project or the account; admission across an expiry while waiting on the account. Each
    is refused with no new command, task or reservation. Controls: the same waits without expiry succeed, and an
    earlier reservation replays after expiry;
  - r3: a first grant after registration against a connection pause and a rotation, with no `40P01`;
  - r3: readiness naming exactly the reason (paused, expired).
- **Mutations.** Each must fail at least one assertion with nothing cancelled, then be restored byte-identical:
  exclusion, semantic hash, account lock, model-only debit, membership recheck, pin fallback, dispatch recheck,
  publication recheck. r2 adds:
  - the dispatch recheck in `runtime_unavailable` and `defer_native_delivery`;
  - the qualification check;
  - the queued-row scan;
  - each project-first lock (grant edit and connection lock helper);
  - the sorted-set recheck;
  - the withhold rules.

  r3 adds:
  - the wall clock, in each of the two time-bound helpers;
  - the post-wait rechecks, in admission and in reservation;
  - the project-first lock in grant creation;
  - the readiness guard (B11).

  The second source-withdrawal rule in `contribution_withhold` (B16) stays a redundant guard: the selected-source scope
  fence refuses that submit first.

## S5b: the authenticated HTTP boundary (development, source only)

**Base.** A local development crossing: published INC01-CC-005 `33c020af` (tree `e1efbfd1`) plus this slice's seven
r3 files from `966b6b94`, byte for byte (constructed tree `3ea7599e`). The prefix carries two known inherited native
P1 races and is not an accepted parent; the final retarget is onto root's accepted repaired parent.

**Crossings checked first.**

- **Migration order.** 0094 runs before 0096. 0096 redefines none of 0094's eleven replaced functions or their
  helpers. The erase hook it replaces (`mission_erase_source`) is not one 0094 relies on.
- **Inventory.** 0094's SQL inventory of `runtime_instances` selectors passes with 0096 present (95 migrations, 8 SQL
  files). The contribution suite passes on the constructed tree.

**Actor.** Every route uses `withActor(pool, req.actorId, …)` with the verified token subject. No body, header or path
field names an owner, requester, payer, credential, runtime or capability. Request schemas have
`additionalProperties: false`, so such fields are rejected (422) before SQL. Authority (owner, the grant's project
admin, a current editor) is decided by the existing 0094 functions under their locks, never by the route.

**Idempotency** (choice 1). One owned ledger, `api_contribution_requests`, keyed by actor, operation, target and
`Idempotency-Key`, with the request's semantic hash and its receipt. One SECURITY DEFINER entry,
`api_contribution_write(operation, key, request)`, granted to the API role:

1. **Ledger first.** Validate the operation's exact keys, then INSERT the ledger row (`ON CONFLICT DO NOTHING`).
   - A concurrent duplicate waits on the uncommitted row, then sees the committed one and replays.
   - A rollback leaves no row and no success.
   - This is the first lock, before the operation's own project, grant, connection and account order.
2. **Existing key.**
   - A different semantic hash is `idempotency_conflict` (409), and nothing changes.
   - The same hash replays the stored receipt, but only after the operation's **current** authority is rechecked:
     - for account and connection operations, the actor still owns the record;
     - for owner grant operations, the actor still owns the grant;
     - for admin operations, the actor is still an admin of the grant's project;
     - for a pin, still an editor;
     - for a grant creation, still a member.
   - Otherwise the replay is `forbidden`.
   - Replay comes before revision checks on purpose: a retry after a successful change returns the original receipt,
     not `stale_revision`.
3. **New key.** Call the unchanged 0094 function and store its receipt.

Receipts hold ids, revisions and states only; the request hash is stored, never the request body or any key value.
Keys are scoped per actor, so no other actor or operation can collide with or probe them. The old direct functions and
their behavior are unchanged.

**Errors** (choice 2).

| Refusal | Code and status |
|---|---|
| `Contribution unavailable: <reason>` (55000) | New `contribution_unavailable`, 409, retry `never`, reason kept |
| `Contribution not permitted: <reason>` (42501) | `forbidden`, 403, reason kept |
| The owned 0A000 messages (`Unsupported …`, `Only Markdown research …`) | `invalid_request`, 422 |
| A foreign or missing record | `forbidden`, uniformly |
| Any other database error | Stays sanitized |

Legacy native and research codes are unchanged. Research admission maps a contribution refusal to
`not_started:contribution_unavailable` with its reason, and never mentions another payer.

**Mount** (choice 3). `buildApp` mounts the whole boundary only when `deps.apiContributions === true`. It is false by
default; `server.ts` and the environment are unchanged. A database without 0094 answers `projection_unavailable` (503)
with no schema detail.

**Admin** (choice 4). Admin routes are keyed by grant. The SQL checks admin of the grant's own project, and narrowing
cannot enlarge the owner's grant.

**Data shown.**

- **Owner only:** accounts, commitments, slots, the credential reference NAME and its revision, and the owner's
  grants.
- **Project members** see a whitelist with no account id, committed usage, slots, credential reference, raw settings or
  other projects. `eligibleForMe` is permission only: readiness reasons still say what is missing.
- **Metadata only.** A connection state `connected` is metadata, not live authentication, qualification or funding.
- **Payers.** Model calls under a pin are paid by the contributor's API account; search and read stay with the
  project. A pin never falls back.
- **Settings.** Requested, accepted and observed stay distinct.

**Not here.** No key intake, registration or qualification over HTTP, and no generic execution or provider endpoint.
Real custodian intake, a qualified route, the ambient-key negative and a teammate's real Explore stay NOT_RUN under the
release hold.

## S5b r2: one identity per UUID (development, source only)

**Base.** A new development child of the S5b r1 commit `e8596e11`, whose parent `33c020af` is not an accepted prefix:
it carries three inherited native P1 races that are not this repair. Written before the code.

**Finding (API-S5B-F01).** A48 types every UUID field as `format: uuid`. The validator behind it (ajv-formats) accepts
`^(urn:uuid:)?` + the 8-4-4-4-12 hex form, case-insensitively. Two things disagree with that:

- `contribution_request_uuid` accepts only lowercase hex, so an accepted uppercase or mixed `accountId`, `projectId` or
  `grantId` is refused as "not an id";
- the semantic hash reads the raw request, so a retry that spells the same `eligibleActors` UUID in another case reads
  as another request and conflicts.

**Repair.** `api_contribution_write` writes each accepted UUID in one spelling (lowercase, no URN prefix) right after
the request-object check. Target, current-authority replay, hash and dispatch all read that spelling. It covers:

- the scalar body or path fields `accountId`, `connectionId`, `projectId` and `grantId`;
- each item of `eligibleActors`, under `settings` for grant create and update and under `patch` for admin narrow, in
  its original order.

Nothing else changes:

- labels, reasons, states and other text are left alone;
- arrays are not reordered;
- a value outside the accepted UUID language is kept as sent, so `contribution_request_uuid` and the settings checks
  still refuse it;
- `contribution_request_uuid` stays strict lowercase, so it accepts only the one spelling.

**Kept.** The actor, operation and target scope, the current-authority replay check, replay before revision, rollback,
concurrent duplicates, foreign or missing records, membership loss, unknown fields and the default-off mount.

**Path parameters.** The owned route file checks path IDs with the shared lowercase pattern, while A48 declares them
`format: uuid`. An uppercase path ID is refused before the database, with no effect. Changing that needs the frozen
route file, so it is reported, not edited. The SQL repair already covers merged path IDs if the route is widened.

**Tests (HTTP + PG, fail-before on `e8596e11`).**

- Upper, mixed and URN spellings of a body `accountId`, `projectId`, `grantId` and `eligibleActors` item name the same
  record.
- A same-key retry in another spelling returns the original receipt and revision, with no new row, event or revision.
- A really different id under the same key conflicts.
- Malformed ids are refused before any change.
- Foreign records, lost membership and stale revisions stay guarded.
- An uppercase path ID is refused, recording what happens.

**Found while testing (after the plan).** A different id in the operation's own target is not a conflict. Examples
are the account of a connection create, or the project and connection of a grant create. The ledger is scoped by
target (r1, kept), so another target under the same key is its own first request. Conflicts are proven on ids
outside the target: the pin's `grantId` and each `eligibleActors` item. A label or other text sent with the request is
stored exactly as sent.

## S5b r3: one identity per UUID in the path (development, source only)

**Base.** A development child of the S5b r2 commit `409d4f75`. Its ancestor `33c020af` is still not an accepted prefix
and carries three inherited native P1 findings, none of them this repair. Written before the code.

**Remainder of API-S5B-F01.** A48 declares every owned path id `format: uuid`, so ajv-formats accepts the hex form in
any case, with an optional `urn:uuid:` prefix. The owned route file instead checks every path id with the shared
lowercase pattern. That covers `accountId`, `connectionId`, `grantId` and `projectId` on the ten writes, and
`projectId` and `taskId` on the two project reads. So a contract-valid uppercase or URN path id is refused with 422.
The r2 SQL respelling covers merged write ids only. A read passes its id to a typed `uuid` argument, which takes
uppercase but not a URN.

**Repair (owned route file only).**

- The owned path schemas use `format: uuid`, the exact language A48 declares.
- After validation, the route writes each path id once in the canonical spelling (lowercase, no prefix), before the
  write merges it into the request and before a read looks anything up.
- The shared `UUID_PATTERN`, `projectParams` and the legacy routes are unchanged. A48 and the generated outputs are
  unchanged.
- Nothing wider is accepted: braces, missing hyphens and padding are still refused by the schema, with no effect.
  Bodies, labels, settings and their order are untouched.
- The r2 SQL respelling stays as it is. It now also guards a merged id that reached it in another spelling.

**Kept.** The actor, operation and target ledger scope from r2, so a different target id is its own request and a
different non-target id conflicts. Also kept: the current-authority replay check, uniform `forbidden` for foreign or
missing records, stale revisions, unknown fields, the default-off mount and `projection_unavailable`.

**Tests (HTTP + PG; fail-before on exact `409d4f75`).**

- Every owned path id in upper, mixed and URN spellings: connection state and grants, grant edit, state and admin
  routes, the pin set and clear, and all three reads.
- A same-key retry in another path spelling returns the original receipt and revision, with no new row or revision.
- Respelling the path never changes the body: labels, settings and order are kept, and owner or payer fields are
  refused.
- Guards: invalid path syntax, foreign and missing ids, a viewer or outsider, stale revisions and unknown fields.
- The r2 test that pinned an uppercase path id to 422 now expects the record to be named.

## S5c: an explicit custodian for the contribution runtime (development, source only)

**Base.** A development child of `9587bd72` (owned API accepted). The native prefix held by `33c020af` and `5eb86c22`
stays held. Written before the code.

**Gap (the S5c preflight).** The contribution route reads its key by the name `OPENAI_RESEARCH_API_KEY`. The only
launcher (`scripts/runtime-host.mjs`) copies named values from its own environment. It requires Sophia's default
`OPENAI_API_KEY`, and it passes every route and search key. Nothing ties the value a contribution runtime holds to
its connection and credential revision. A launch from the operator's usual environment would pay with Sophia's key
under the contributor's attribution.

**Source repair (nine paths).**

- **`RuntimeSupervisor` gains an optional `credentialValues` map.**
  - Undefined keeps the old lookup exactly.
  - A map, including an empty one, completely replaces the ambient lookup: no merge and no fallback for a missing
    entry.
  - In that mode, `extraEnv` may not set a credential, bridge, home, path, runtime, reply or Node code-loading name,
    and the map may not set one either. Both are refused before spawn. Legacy callers are unchanged.
- **`scripts/lib/contribution-custody.mjs` (new).**
  - **The binding record.** A closed, versioned record that registration writes for one runtime: project, runtime,
    resource, connection, credential revision, unit, route, service origin and capability. It is created
    exclusively, `0600`, in a private directory.
  - **The custody file.** One per (connection, revision, route), in a configured operator-owned directory. Its name
    is derived from the binding, never from the file. Its closed header (`connection`, `revision`, `route`) must equal
    the binding's. The header declares a binding; it does not prove provider account ownership, organization,
    benefit or qualification.
  - **Both are read the same way.** `O_NOFOLLOW|O_NONBLOCK`; the descriptor must be a regular file owned by this
    user, not group- or other-accessible, with one link; the path identity must equal the descriptor's; ancestors
    must be owned by root or this user, and not writable by others unless root-owned and sticky. The read is bounded
    and must not change while read.
  - **Refused before spawn,** with a fixed code and never the value: a symlink, FIFO, socket, directory, oversize,
    blank, CR, NUL, extra or unknown lines, a mismatch, or path traversal. No `chmod`, adoption, or discovery of real
    credential stores.
- **`scripts/contribution-runtime-host.mjs` (new).**
  - It composes the exported primitives: the root lease before profile reconciliation (`holdHostRoot`,
    `reconcileHostProfile`), the recorded artifacts and profile, and one `RuntimeSupervisor`. It never imports the
    general CLI.
  - The selected key comes from custody only, into `OPENAI_RESEARCH_API_KEY`, through an explicit map. The default,
    Tavily and Jina keys are never required or inherited, so external search and read stay unavailable: project
    sources only.
  - The destination is the recorded unit's route, which the launcher checks. Nothing in a file picks a URL.
  - The value is read once per launch. A restart reuses it, and replacing the file never rebinds a running runtime.
- **`scripts/register-contribution-runtime.ts`.** With `--binding-dir` and `--service-origin` it writes the binding
  record, holding the capability, and prints only metadata and the path. Without them it behaves exactly as before
  (capability printed once). Registration stays an operator act under the RTA; tests use disposable databases only.

**Unchanged.** 0094's pin, grant, account, connection, credential-revision, reserve, dispatch, wall-clock and
publication checks. Rotation blocks new calls and new work, while reserved and uncertain commitments stay, and an
authorized already-produced result may still publish under the old payer and revision. Nothing is cancelled or
refunded. Requested, accepted and observed settings stay distinct; the last two stay `unknown` where unobserved.

**Tests (fake keys, directories and services, disposable PG).**

- **Unit:** the custody reads and records.
- **Integration:**
  - the real API and worker, the real pinned dsh under the new launcher, and a Responses stub that records headers;
  - wrong ambient default, research, Tavily and Jina values are set;
  - registration, then launch, then another member's pin and admission, then reserved and settled model calls, then
    one retained project-source Explore result with funding `contribution` and model payer `contributor_api_account`;
  - every refusal before spawn, and a scan of argv, logs, journal, database and prompts for the invented value.
- **Supervisor:** the map semantics, plus the legacy behaviour unchanged.
- **Minimal class mutants.**

A fake completion is not real account, billing or acceptance evidence. A test under a different expected UID is
structural only: no real foreign UID is used.

## S5c r2: one registration, retained or rolled back (development, source only)

**Base.** A development child of S5c `0fec829d`, with the same nine paths. Written before the code.

**Finding S5C-F01 (the independent OWNED9 study).** `withClient` opens no transaction, so
`register_contribution_runtime` autocommitted its replacement, revision advance and draining before `writeBinding`
validated and durably kept the only, unprinted capability. Two cases reproduced it:

- An uppercase spelling of a valid project id committed and revoked, then failed `binding_invalid`.
- A private `0500` directory with `--rotate` committed revision 2 and drained the old runtime, then failed
  `binding_unwritable`.

In both, the new capability was lost and the prior binding was already revoked. A writability precheck cannot close
this: a later create, write or fsync can still fail.

**Ordering in binding mode (`--binding-dir` and `--service-origin`).**

1. **Validate everything the caller controls, before any connection.**
   - `projectId` and `connectionId` must be UUIDs spelled 8-4-4-4-12 hex, in any case, optionally prefixed
     `urn:uuid:` (the 0094 r2 spelling). Each becomes lowercase without the prefix. Any other spelling that PostgreSQL
     would also accept (braces, no hyphens) is refused with `id_invalid`.
   - The unit must match the record's unit pattern (`unit_invalid`). The origin must be an exact http(s) origin
     (`service_origin_invalid`). The directory must pass the existing private-directory checks.
   - A provisional record (the canonical fields, placeholder ids, revision 1 and the fresh capability) must pass the
     closed record parser. This ensures the real record can differ only in values that SQL returns.
   - A refusal here exits 1 with its fixed code. Nothing was registered and nothing was written.
2. **Connect, then `BEGIN`.** A failure before `COMMIT` is sent is a definite rollback: PostgreSQL commits nothing
   without `COMMIT`, and a dropped connection aborts the open transaction.
3. **`register_contribution_runtime`, with the canonical ids, inside the transaction.** Its locks, checks and effects
   are unchanged. An SQL refusal means `ROLLBACK`, definite.
4. **Build the real record** from the returned runtime, resource and revision. Then **create it exclusively and
   durably** while the transaction is still open (`createBinding`):
   - the record is parsed again;
   - the private-directory checks run again;
   - `open(O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW, 0600)`; an existing file is never replaced or adopted;
   - a write loop until every byte is written, where a zero-byte write is a failure;
   - `fsync` the file, check its size, close it;
   - `fsync` the directory;
   - read the record back through the guarded private read and compare it field by field.

   If any step after the create fails, the file this call created is removed, and only while the path still names
   that file's device and inode. The directory is then fsynced, and the error is a fixed code. A failure here means
   `ROLLBACK`, definite.
5. **`COMMIT`.**
   - **Committed:** `COMMIT` resolves with the `COMMIT` tag. Only now is success printed: the ids, the revision, the
     record path and the custody file name, never the capability. Exit 0.
   - **Definitely rolled back:** `COMMIT` resolves with the `ROLLBACK` tag, or is refused with a server `ERROR`
     while the connection survives. The record is removed as in step 4. Exit 1, with `registration rolled back`.
   - **Unknown:** `COMMIT` was sent and the connection failed, or the server answered `FATAL` or `PANIC`, or anything
     else. The record is **kept**: it holds the only copy of a capability that may now be current. The output names
     the original runtime, resource, connection and revision ids and the record path, but never the capability. It
     says the outcome is unknown and how to reconcile it: if `sophia.runtime_instances` has that runtime id
     `active`, the record is its binding; if the id is absent, nothing was registered and the record authorizes
     nothing. Exit 3. Nothing is retried, rerun, regenerated, rebound or adopted.
6. **A definite failure removes the record** (steps 3 to 5). If the removal fails, the message says a record for an
   uncommitted runtime may remain at the path and authorizes nothing. The path is printed, never the capability.

**Effects.** The prior current runtime, its capability, the credential revision, draining and every old reservation
are exactly as before on a definite failure, because the transaction never committed. On an unknown outcome the
database holds either the whole registration or none of it. The kept record and the ids decide which, by one
read-only lookup that the operator performs. A crash between create and commit leaves a record whose capability hash
was never committed; it authorizes nothing.

**Legacy mode is unchanged.** Without `--binding-dir`, the single autocommitted call runs and the capability is printed
once, as before. The process stays the record, and this flow keeps no file.

**Unchanged.** SQL, grants, payer, rotation, draining semantics, the closed schemas, every read guard, the launcher and
the supervisor. `writeBinding` remains as `createBinding(...).path`.

**Tests (real registration CLI and disposable PostgreSQL; fake capabilities and directories).**

- **A snapshot** of the connection row, the connection's runtime links, the project's executor resources, its
  runtime instances (identity, unit, token hash, state and revocation; not liveness) and its contribution
  reservations is taken before each case.
- **Refused before SQL, with the snapshot equal and the directory empty:**
  - a malformed or brace-spelled id;
  - a unit outside the record pattern;
  - an origin with a path;
  - a relative, missing or group-readable directory.
- **Failures after the precheck,** each with `--rotate`, so a leak would show an advanced revision and a drain. Each
  must leave the snapshot equal, the directory empty, exit 1 with `rolled back`, and print no capability:
  - **Create fails:** a `0500` directory, for a non-root uid, as the study reproduced it. When the suite runs as
    root, the CLI is spawned as uid and gid 65534 with that uid owning the directory. This is a real `EACCES`.
  - **Write fails:** the CLI runs under `ulimit -f 0` with `SIGXFSZ` ignored, so the first write to the created
    record fails with a real `EFBIG`.
  - **Connection lost before `COMMIT`:** a loopback PostgreSQL proxy in the test closes both sides when the
    registration call passes.
- **Unknown, through the same proxy, each with `--rotate`, exit 3:**
  - **Rolled back:** the proxy closes the connection on `COMMIT` before forwarding it. The record is kept and the
    original ids are reported; the database shows no row for the runtime id and the snapshot equal.
  - **Committed:** the proxy forwards `COMMIT`, then cuts the reply. The record is kept and its capability's SHA-256
    is the committed runtime's token hash. The revision advanced exactly once and no second runtime was created
    (never replayed). The kept record then launches the runtime to ready under the real launcher.
- **Successes:**
  - uppercase and `urn:uuid:` spellings register the same project and connection, and the record carries lowercase
    ids;
  - a replacement revokes only the earlier runtime of the same resource;
  - a rotation advances once and drains.
- **Legacy:** without a directory, the capability is printed and its hash is the current token.
- **Unit:** `createBinding` with injected I/O covers short writes, a zero-byte write, file fsync, close and directory
  fsync failures, removal only of its own inode, and a read-back mismatch. The canonical-field validation is
  unit-tested too.
- **Existing tests:** the custody unit, supervisor and Explore crossing tests are rerun.
- **Fail-before** on `0fec`, then minimal class mutants, with the source restored by SHA-256.

## S5c r3: only a positive receipt decides a sent COMMIT (development, source only)

**Base.** A development child of S5c r2 `c626549e`, with the same nine paths. Written before the code.

**Finding S5C-R2-F01 (the independent OWNED9 study).** Once `COMMIT` was sent, r2 classified every resolved result
other than the `COMMIT` tag as a definite rollback, contrary to r2's own plan. A loopback fault proxy forwarded a
genuine `COMMIT` and saw its genuine `COMMIT` tag. It then replaced that tag with `SELECT 0`, or dropped it while
still relaying `ReadyForQuery`. The CLI exited 1, said nothing was registered and deleted the only binding, while the
revision had advanced, the new runtime was active and the old link was draining. This was an injected, malformed
answer, not something PostgreSQL normally sends.

**Classification once `COMMIT` may have been sent (the only change).**

- **Committed:** the client resolves with the command tag `COMMIT`.
- **Definitely rolled back:**
  - the client resolves with the command tag `ROLLBACK`, which PostgreSQL returns for `COMMIT` of an aborted
    transaction; or
  - `COMMIT` is refused with a server `ERROR` while the session survives (unchanged from r2).
- **Unknown: everything else.** That includes another tag, no tag, a non-object result, `FATAL` or `PANIC`, and a lost
  session. The record is kept with the original project, connection, runtime, resource and revision ids, exit 3, the
  capability unprinted and nothing retried, exactly as for a lost `COMMIT`.

Validation before any connection, `BEGIN`, the durable create, write, read-back and own-inode cleanup, failures
before `COMMIT`, the success output and legacy mode are unchanged.

**Tests (real registration CLI, disposable PostgreSQL, the test's loopback proxy).**

- **The proxy gains answer rewriting after a genuine `COMMIT`.** It records that the server's genuine tag was
  `COMMIT`, then either relays `SELECT 0` in its place or drops it and relays `ReadyForQuery`. Each case must:
  - exit 3 and report unknown;
  - keep the record, whose capability's SHA-256 is the committed active runtime's token;
  - report the original ids;
  - advance the revision exactly once, with exactly one new runtime and the prior runtime draining;
  - print no success line and no capability.
- **A genuine `ROLLBACK` tag.** The proxy, on `COMMIT`, first sends the server a failing statement (division by zero)
  inside the same transaction and absorbs its answer, then forwards the genuine `COMMIT`. The server answers
  `ROLLBACK`. Expected: exit 1, `rolled back`, no record, and the database snapshot unchanged.
- **A genuine server `ERROR` at `COMMIT`.** A deferred constraint trigger, created in the disposable database for one
  test-only unit id and dropped afterwards, raises at commit time. Expected: exit 1, `rolled back`, no record, and
  the snapshot unchanged.
- **Kept controls:** the clean commits (uppercase, `urn:uuid:`), the lost-before and lost-after `COMMIT` cases, the
  `EACCES`, `EFBIG` and lost-session rollbacks, and the earlier refusals.
- **Fail-before on `c626`:** the two rewritten-answer cases must fail. The `ROLLBACK` and `ERROR` controls pass there
  too, since r2 already classifies them correctly.
- **Class mutants:**
  - restore r2's two-way classification;
  - treat a `ROLLBACK` tag as unknown;
  - ignore a server `ERROR`;
  - treat any other tag as committed.

## INC01-COHERENT-WRITE-003: a rebuilt contributed task keeps its funding binding (0100)

**Finding CW2-REBUILD-F01, confirmed P1.** It was found by the coherent composition and is inherited from this slice's
0094. Source erasure revokes a consuming research task, then `research_rebuild` (0033, which 0094 does not replace)
queues a replacement on the same contribution runtime and allowance, with no `api_contribution_tasks` row.

- Every 0094 consumer read that as project work: dispatch, paid reservation, ledger link, publication and the funding
  read. The replacement's paid calls on the owner's runtime escaped the grant, credential, member and cap checks, and
  the funding read reported `project`.
- **The repair** is append-only `0100_api_contribution_rebuild_funding.sql`, with 0094 unedited.
  - The rebuild copies the original frozen binding, unchanged.
  - Every 0094 gate then applies as written: the task cap is cumulative per allowance, and current authority is
    checked at dispatch and at each paid call.
  - An orphan made before 0100 is fenced at dispatch, at a paid call (`lineage_unbound`), at publication (withheld)
    and at the funding read.
  - Source erasure and the original's revocation and Stop always commit.
  - Full plan: `docs/plans/inc01-coherent-composition.md`, "WRITE-003".
