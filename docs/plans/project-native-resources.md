# Project native resources: the member-safe catalog read (INC01-CC-006)

Written before any code. INC01-CC-006 is the resource-catalog read producer. Contract amendment A51 and migration 0097
are assigned to it centrally. Its proposal is preflight `705dfc82`. It follows the independent study `86927309` and its
mandatory erratum `86c57eb3`. Claude Code backend author, session `session_01FGXfrJoUMojmJSW3H7XfoG`.

## Composition (development only, unaccepted, no publication)

| Part | Source |
|---|---|
| Base | the S01b candidate `37b1f47d` (tree `46c34f97`) |
| 10 byte copies, per the recipe (`aebad1d1`) | 6 native repair-6 paths from `5eb86c22` and 4 API r3 paths from `9587bd72` (blobs and SHA-256s verified) |
| Resulting starting tree | `52f5ec32ab3b93518a6d1f1ef6ddd32175f78f60`, verified before any product edit |

This development prefix carries the accepted API source but the unaccepted native repair-6 core. It is not a whole-prefix
acceptance, and no publication parent is chosen here. A later accepted-native, actual-main retarget and a whole
crossing review are still required. The deliverable is one signed development child of `37b1f47d`.

**Owned paths (9):**
- `db/migrations/0097_project_native_resources.sql`, and its SQL test;
- `packages/contracts/amendments/A51-project-native-resources.json`;
- `packages/persistence/src/project-resources.ts`, and its DB test;
- `apps/api/src/routes/project-resources.ts`, and its DB test;
- this plan, and `docs/handoffs/INC01-CC-006.md`.

**Shared files, transferred from S01b for this slice, additive only:**
- `openapi.json` and `generated-types.ts`, by the generator;
- one export in `packages/persistence/src/index.ts`;
- one import and one mount in `apps/api/src/app.ts`.

**Unchanged:** A48, A49 and A50; 0092 to 0096; existing policies and grants; environment flags, `server.ts` and `/ready`;
the native, transport and Map paths; and the UI.

## What it is

`GET /api/v1/projects/{projectId}/native-resources?after=<uuid>`: a catalog of the project's enrolled native resources
(`codex-native` and `claude-native`; the `dsh` runtime is excluded).
- **Authentication.** Authenticated and read-only through `withActor(…, 'read')` (one REPEATABLE READ READ ONLY
  snapshot per page), with the actor from the verified token.
- **Served always.** It is served with new owner-runner admissions off, and is no grant, GO, control or readiness
  signal.
- **No writes.** It writes, locks, sends and infers nothing.
- **Its own DTO.** It has its own DTO, never cast to the Studio `Resource`. The later frontend adapter must map
  `claude` to `claude-code` and a null owner label to an unknown name. It must keep accounts, sessions and assignments
  unknown, under its own lease. This backend does not complete the UI.

## The page (A51 `ProjectNativeResourcePage`)

```
{ observedAt,                 // one database instant (clock_timestamp at the read's start), used for every comparison
  resources: [ ≤ 200 ],       // ordered by resource id
  nextCursor: uuid | null,    // the last id of this page when a 201st row exists, else null
  complete: boolean,          // nextCursor === null: no further row after this page in this observation
  notReported: ['sessions','assignments','models','efforts','capacity','readiness','signIn','accounts'] }
```

- **Pages are observations, not a stable snapshot.** Each page is an observation within the reader's current
  authority. It is not a grant, and it does not promise a stable snapshot across pages.
- **Empty.** An empty `resources` with `complete: true` means the catalog was observed empty, from the start or after
  the cursor.
- **No totals.** There is no total count.
- **What is never reported.** Sessions, assignments, models, efforts, capacity, readiness, sign-in and accounts have no
  producer. They are declared in `notReported`, never returned as `[]`, and no account or entitlement id is derived
  from connection or resource ids.

**Each resource:**

```
{ id, tool: 'codex'|'claude', state: 'active'|'revoked'|'needs_connection',
  owner: { id, label: string|null, isYou, isMember },
  mine: null | {                                   // the owner only; null for everyone else
    connection: { state, expired },
    host: null | { state: 'bound'|'active', helloOk, helloConflict, lastSeenAt: string|null, secondsSinceSeen: int|null },
    recordedQualification: { state: 'none'|'current'|'expired'|'revoked'|'stale'|'not_applicable',
                             operations: ('create'|'input'|'stop')[], qualifiedAt|null, expiresAt|null } } }
```

- **Owner label.** `owner.label` is `actor_label(project, owner, NULL)`, null when unknown.
- **Owner membership.** `owner.isMember` is the owner's current active membership in any role, so a former owner shows
  `false`.
- **Excluded fields.** No label, `repository_root`, `host_id`, allowed operations, credential, account key, environment,
  profile, journal or capability is returned. `helloConflict` is `hello_conflict IS NOT NULL`, never its text.
- **The host.** It is the connection's one live host. 0096 installed the `owner_hosts_one_live_per_connection` unique
  index and refuses to migrate over duplicates, so there is no fan-out and no conflict selector (erratum).
  - Neither `bound`/`active` nor a last-seen time means online or signed in.
  - `secondsSinceSeen` is null when the time is missing or later than `observedAt`, so it is never presented as fresh.
- **The qualification record.** It is the unique unrevoked qualification of the (project, resource), else the latest
  historical row by `(qualified_at, id)`.
  - It is `current` only when all of these hold:
    - unrevoked, with `expires_at` after `observedAt`;
    - the resource active, and its revision matching;
    - the connection linked, unexpired, with matching id, owner and revision;
    - the owner an active admin or editor.
  - Otherwise it is `revoked`, then `expired`, then `stale` (an id or revision moved), then `not_applicable` (the
    resource, connection or owner's role no longer allows it).
  - It is the operator's recorded evidence, not live per-operation readiness. It is not mapped to supported or verified,
    and does not promise that a Stop works. A47 admission and dispatch decide, unchanged.
  - Nothing here gates a safety Stop on new-work allowance, and no operation target is invented.

## SQL (0097, additive)

- **`sophia.project_native_resources(p_project uuid, p_after uuid) RETURNS jsonb`.** `STABLE SECURITY DEFINER`, with
  `search_path=pg_catalog, sophia`. `REVOKE ALL FROM PUBLIC`, and `GRANT EXECUTE TO sophia_api` only.
  - The member gate comes first: `actor_id()` and `is_member(p_project)`, else NULL. A missing project and a nonmember
    look alike.
  - It then reads at most 201 rows by id after the cursor, and builds the page.
- **The private part.** It is built by a helper that only the definer can execute. It is called only when the row's
  owner is the actor, so no private join runs for anyone else.
- **Nothing else changes.** No table, policy, grant or index changes, and no raw `r.*` is selected.

## HTTP (A51; `routes/project-resources.ts`)

| Request | Response |
|---|---|
| Valid | 200 with the page, `cache-control: no-store` |
| Unauthenticated | 401 (existing hook) |
| Not a member, or no such project (NULL) | 404 `not_found` |
| A malformed id or cursor | 422 (schema) |
| `to_regprocedure` finds the function absent | 503 `projection_unavailable` (never an empty list) |
| Any database failure | `classifyDbError`, with no SQL text |

- **Ids.** Path and cursor ids are declared and validated as `format: uuid` in the contract and the route alike. They
  are then canonicalized to one lowercase spelling without the `urn:uuid:` prefix, as A48 r3 does, so the declared
  language is the accepted language. The global `UUID_PATTERN` is unchanged.
- **Mounting.** Always mounted; default-off admissions and `/ready` are unchanged.

## Proof plan

Real PostgreSQL with the real application roles (`sophia_api` through `withActor`), plus HTTP through `buildApp`:
- **Who reads.** The owner, a teammate (editor), a viewer, a former owner, a nonmember and a missing project.
- **What they see.** `mine` only for the owner, and no private field or text anywhere else (responses and errors).
- **Qualification states.** None, current, expired at the one clock, revoked with history, stale by resource or
  connection revision, and not applicable (the resource revoked or needs a connection, the connection unlinked or
  expired, the owner made a viewer or removed).
- **Host.** None, bound, active (with `helloOk` and the conflict boolean), retired (excluded), a future last-seen
  time, and a null one.
- **Rows.** `dsh` rows are excluded, and `active`, `revoked` and `needs_connection` rows are all shown.
- **Pages.** 201 or more resources page stably with no duplicate or missing row. A complete empty catalog differs
  from a partial page and from 503.
- **Ids.** UUID case and the URN form are canonicalized; malformed ids and cursors answer 422.
- **No effects.** Outbox, commands, events and qualification use counts are unchanged.
- **Regressions.** The contract generation and check, the targeted new SQL, persistence and HTTP tests, the existing
  API and A47/A48 read regressions, and then `pnpm check`.
- **Mutations.** The owner gate, the member gate, the 201st-row detection and the current-qualification rule, each
  removed in turn.

## r1: legal qualification records stay readable (INC01-CC-006-dev-BOUNDED-SOURCE-STUDY-001: CC006-F01, CC006-F02)

Written before any code. One signed development child of `b6f0bf05`. The renewed lease covers the 0097 migration and
its SQL test, A51, the two DB tests, this plan and the handoff. `openapi.json` and `generated-types.ts` change by
regeneration only. `app.ts`, `index.ts`, the persistence reader and the route stay byte-exact. 0092 to 0096 are frozen.

### The defects

The frozen 0092 qualifier accepts records the 0097 projection could not serialize, so the owner's whole catalog page
failed (a teammate's view, without `mine`, still served):
- **F01.** Any non-empty array of `create`, `input` and `stop`, duplicates included (`[create, input, stop, stop]`).
  0097 copied it as is, past A51's `maxItems: 3`.
- **F02.** Any expiry after `qualified_at`, including `infinity`, or a finite time past year 9999. 0097 emitted it as
  is, but A51 requires RFC 3339 date-times.

### The policy

- **Operations are a set.** The projected operations are the distinct recorded values, in the fixed order `create`,
  `input`, `stop`: at most three. Nothing is added, and nothing outside the record appears.
- **A time with no RFC 3339 form is null, and its meaning is documented.** `qualifiedAt`, `expiresAt` and `lastSeenAt`
  are each projected only when finite and between years 1 and 9999. Otherwise they are null, meaning no representable
  finite time was recorded. For `expiresAt`, a recorded `infinity` therefore reads as null: no finite expiry was
  recorded.
- **The state is never judged on the null.** Every comparison (current, expired, the connection's expiry, the
  host's age) uses the recorded value itself. So a qualification recorded to expire at `infinity` is still `current`
  when everything else holds. No finite expiry is invented, and a null never implies `not current`.
- **Age.** `secondsSinceSeen` is null unless the recorded last-seen time is representable and not later than
  `observedAt`, so `-infinity` or a far past never fails the read.
- **The contract.** A51's descriptions state these rules, so the shape is unchanged. Only description text
  regenerates `openapi.json`, and `generated-types.ts` is unchanged if no type moves.
- **Unchanged:** privacy (owner-only `mine`), the record-versus-readiness wording, and no control mapping.

### Proof plan

**Fail-before on exact `b6f0bf05` with the final tests**, through the actual qualifier, `withActor` on `sophia_api`
and authenticated HTTP:
- operations `[create, input, stop, stop]`, `[stop, create, stop, input]`, `[stop, stop]` and the subset
  `[input, create]`;
- an `infinity` expiry, and a finite expiry beyond year 9999;
- a year-9999 expiry that stays representable;
- host last-seen times of `infinity` and `-infinity`.

**After the fix:**
- the owner reads 200, with sets in canonical order and nulls where documented;
- the states stay those of the recorded values (`current` for an `infinity` expiry, `expired` for a finite past one);
- the teammate reads 200 with `mine` null;
- the earlier cases still hold.

**Mutations:**
- the distinct set removed;
- the representability guard removed from `expiresAt`;
- the age guard removed.

## r2: full RFC 3339 times, whatever the session time zone (INC01-CC-006-r1-BOUNDED-SOURCE-STUDY-001: CC006-R1-F01)

Written before any code. One signed development child of `13c9096e` (tree `49dc9be7`). Exactly six writable paths: the
0097 migration and its SQL test, the persistence and API DB tests, this plan and the handoff. A51, every generated
output, `app.ts`, `index.ts`, the reader and the route stay byte-exact. Nothing in the contract changes: A51's
`date-time` already says what is needed.

### The defect

r1 judged an outward time representable by its year in the session time zone. But jsonb renders a `timestamptz` in that
zone, with that zone's offset at that instant, and historical offsets carry seconds. So a legal 1900 time, read by an
API session in `Asia/Kathmandu`, is `1900-01-01T05:41:16+05:41:16`, which is not RFC 3339, and the owner's whole page
answered 503. Any of `qualifiedAt`, `expiresAt` or `lastSeenAt` alone did it. PostgreSQL 16 here also renders
`Europe/Amsterdam` 1900 as `+00:19:32` and `Africa/Monrovia` 1960 as `-00:44:30`. A teammate's view, without `mine`,
still served.

### The policy

- **One fixed rendering zone.** `sophia.project_native_resources`, the only executable entry point, runs with
  `SET TimeZone = 'UTC'`, a function-level setting. Every outward time on its page is built inside it: `observedAt`,
  `qualifiedAt`, `expiresAt` and `lastSeenAt`. Each is rendered `YYYY-MM-DDThh:mm:ss[.ffffff]+00:00`. PostgreSQL
  restores the caller's setting when the function returns, so the caller's session is not changed. DateStyle and
  IntervalStyle do not affect the jsonb rendering.
- **Representable exactly when the UTC year is 1 to 9999.** The r1 guard (`extract(year) BETWEEN 1 AND 9999`) is
  unchanged, but it now runs in UTC, so it judges exactly the string that is written. Two consequences:
  - UTC year-1 and year-9999 times are read as themselves in every session zone. A session in New York or Kiritimati
    no longer turns them into local BC or year 10000.
  - Infinity, -infinity, BC and beyond-9999 times stay null, meaning no representable finite time, as A51 already
    documents.
- **Unchanged:**
  - every comparison: state, expiry, the connection's expiry and the host's age, all zone-independent;
  - the one clock (`clock_timestamp()` at the read's start), so `observedAt` is the same instant, now always written
    in UTC;
  - `secondsSinceSeen`: null with an unrepresentable or future `lastSeenAt`, never 0 or fresh;
  - an infinity expiry stays `current`, and a null means neither expired, unlimited nor ready;
  - membership privacy, the page shape, and no row or `mine` is dropped.
- **No new sentinel, no weaker validation, and no production setting.**

### Proof plan

**Fresh synthetic PostgreSQL 16 with the production API role.** The caller's own session zone is set:
- for the persistence reader: `SET LOCAL TimeZone`, and DateStyle and IntervalStyle, inside the `withActor`
  transaction;
- for authenticated HTTP: the API pool's connection `options`, given to `buildApp`.

**Zones:**
- UTC;
- `Asia/Kathmandu`, `Europe/Amsterdam` and `Africa/Monrovia`, which have historical offsets with seconds;
- `America/New_York`, where UTC year 1 becomes local BC;
- `Pacific/Kiritimati`, where UTC 9999 becomes local year 10000;
- Kathmandu with DateStyle `SQL, DMY` and IntervalStyle `sql_standard`.

**Isolated fields:**
- a 1900 `qualifiedAt`;
- a 1900 `lastSeenAt`;
- an expired 1900 `expiresAt` (with `qualified_at` `-infinity`);
- UTC year-1 `qualifiedAt` and `lastSeenAt`;
- a `9999-12-31T20:00Z` expiry;
- BC, infinity and -infinity, which read as nulls;
- a future `lastSeenAt`, which has no age.

**Every zone reads the same exact strings**, plus:
- states as recorded;
- ages consistent with `observedAt`;
- `observedAt` ending `+00:00`;
- the session's zone unchanged after the read.

The teammate reads 200 with `mine` null. The SQL test checks the reader's configuration and a Kathmandu read as
`sophia_api`.

**Fail-before** runs on exact `13c9096e` with the final tests.

**Mutations:**
- the fixed zone removed;
- a fixed non-UTC zone;
- the year-9999 boundary narrowed;
- the `expiresAt` guard removed.

The first two kill the fix itself, the other two its boundaries.

**Then:** focused SQL; the resource DB and API tests; adjacent API read regressions; contracts, format, lint and
types. No development full check, as assigned.

**Historical, not product failures:** the reviewer's first Amsterdam diagnostic (which read 200 in its own tzdata) and
its first CHECK-constraint fixture error stay in their record.
