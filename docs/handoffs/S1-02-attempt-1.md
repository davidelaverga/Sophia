# Implementation-session handoff: S1-02, attempt 1

- **Goal and attempt:** S1-02 "Admit a project command and replay its
  state in the UI", attempt 1.
- **Human owner / executor resource:** Luis (owner). The executor is Claude
  Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** none. S1-02 creates no dsh Agent session.
- **Starting worktree/commit:** written in a separate `sophia-next` scaffold
  (base `f158c2e`) before S1-01 was merged here, then ported onto this
  repository at `docs/pack-v0.4` (the v0.4 pack import).
- **Writable scope:** this repository; the hosted Supabase project
  `sophia-next` (ref `ikigawvpaxnvdjzzzhws`, org Sophia, us-west-1).
  Davide's older Supabase project was not touched.
- **Ending commit/tree:** branch `s1-02/admit-command`. Changed paths are
  the S1-02 rows of [DESTINATION_MAP](../DESTINATION_MAP.md).

## Outcome

Two signed-in people can share a project. Each sees the same snapshot, and
goal commands one of them sends reach the other's open page live. An
account that is not a member gets 403 and sees none of the project.

- **API** (`apps/api`, Fastify): Supabase JWT verification through JWKS
  (ES256), `POST /projects` (idempotent), `GET …/snapshot`,
  `POST …/commands` (admission with `Idempotency-Key`), `GET …/events` (SSE:
  replay, then a live tail through `LISTEN/NOTIFY` with a heartbeat
  re-read; membership rechecked on every read). `/ready` refuses a
  migration-owner, superuser or BYPASSRLS login.
- **Database:** pack migrations 0001–0004 verbatim, plus 0005 (event
  notify), 0006 (idempotent project creation) and 0007 (dispatch fencing,
  which fixes a `claim_outbox` gap found by the race suite). A
  checksum-ledger runner applies them.
- **Studio** (`apps/studio`): magic-link sign-in (PKCE), project start and
  shared links, the S1-02 work view (snapshot, live feed, Request review /
  Hold / Stop). A lost reply shows "Not confirmed" with a retry under the
  same key. Nothing in the UI claims completion.

| Acceptance requirement | Evidence | State |
|---|---|---|
| Both real member sessions access the shared project; a different account cannot | `api.db.test.ts`, `persistence.db.test.ts` (sql-run); `supabase.live.test.ts` against local and hosted Auth (two real accounts share, a third gets 403); Luis signed in on the hosted project and created "Sophia" | **met for one founder live**; Davide's own sign-in on hosted is outstanding |
| Same request/payload returns the same command; a different payload conflicts | HTTP and SQL tests, including two real connections racing on one key | **met** (sql-run) |
| A disconnect between commit and acknowledgement recovers the existing result | the server destroys the socket after commit; the retry with the same key returns the first receipt; one row | **met** (sql-run) |

| Adverse check | Evidence |
|---|---|
| A stale expected revision cannot overwrite | `stale_revision` over HTTP and SQL; two concurrent Holds, exactly one wins the epoch |
| A UI render or notification click cannot manufacture completion | receipts read "Admitted … recorded"; summaries say "requested"; checked in the browser for this view |

## Evidence

The full record, with commands, counts, mutation checks and the hosted
steps, is [docs/evidence/S1-02/2026-09-24-attempt-1.md](../evidence/S1-02/2026-09-24-attempt-1.md).
In this repository:

```text
pnpm typecheck                       # clean
pnpm test                            # S1-02 unit tests pass
pnpm test:sql --source pack          # pack 0001–0004 + SQL test
pnpm test:sql                        # 0001–0007 + SQL test
pnpm test:db                         # 50/50 on postgres:16 (persistence, races, HTTP)
pnpm supabase:local && pnpm test:supabase   # 3/3 live-local
```

CI adds two jobs: `database` (PostgreSQL 16 service) and `supabase-live`.
Source-register ids: P-01, P-02 (the goal's `source_ids`), plus the pack's
`db/`, `api/` and architecture 12 bindings.

## Decisions and changes

- **Migrations 0005–0007 are additions, never edits.** 0001–0004 stay
  byte-identical to the pack. 0006 exists because the contract requires
  `Idempotency-Key` on project creation and the pack's
  `create_project(text)` had none. 0007 exists because the pack's
  `claim_outbox` never rechecked the body source, contradicting its own
  rule that a revoked source denies a queued dispatch.
- **Ajv rejects unknown properties** (`removeAdditional: false`), so a
  client cannot send `actorId` and have it silently dropped.
- **The snapshot fails loudly** (503 `projection_unavailable`) when rows
  exist for projections that later goals build, instead of returning false
  empty lists.
- **Tests use `node --test`**, like the S1-01 tests. `*.db.test.ts` needs
  PostgreSQL, `*.live.test.ts` a Supabase stack; `pnpm test` runs neither.
- **TypeScript runs without a build step** (Node type stripping,
  `allowImportingTsExtensions`, `erasableSyntaxOnly`). The dsh bundle still
  builds with `tsc`, because the runtime loads it from `dist/`.
- **`.gitattributes` forces LF**, so `docs/pack/` is byte-identical to the
  archive on Windows checkouts too.
- **Hosted TLS is `verify-full`** with Supabase's Root 2021 CA
  (`deploy/supabase/prod-ca-2021.crt`), never `no-verify`.

## Remaining obligations

- **Davide signs in on the hosted project**, then
  `node --env-file=<hosted env> scripts/add-member.ts <projectId> <email> editor`
  adds him to "Sophia". This is the remaining human step of the first
  acceptance line. `add-member` is a stand-in until the invitation handler
  exists.
- **Hosted project settings:** public sign-up is still on (the Supabase
  default) and SSL enforcement is off. Turn sign-up off after both
  founders have accounts; see [deploy/supabase/README.md](../../deploy/supabase/README.md).
- **The Studio has no hosted deployment.** Davide cannot reach Luis's
  `localhost`. Vercel (Studio) and Render (API) belong to S1-04/S1-14; the
  Auth Site URL and redirects change then.
- **Open design gaps:** no viewer role in the snapshot (a viewer sees the
  controls and is refused), no project list operation (people share
  links), no invitation or revocation handlers.
- **Claim vs. an uncommitted withdrawal:** `claim_outbox` does not lock the
  source row. The dispatcher (S1-03/S1-09) must recheck eligibility at
  effect time, and withdrawal handlers must take the project lock first.
- **Secrets** (database passwords, the Supabase secret key) live only in
  `~/.sophia/` on Luis's machine. None is in Git.

## Next bounded action

- **Luis and Davide:** make the Studio reachable for Davide (a first
  Vercel/Render deploy of Studio and API against the hosted project).
  Davide signs in once and Luis runs `add-member`. With both founders in one
  project, S1-02's first acceptance line is met live.
- **Luis:** runtime validation of API responses in the Studio (replace the
  JSON casts), then the invitation handler.
- **S1-03** (Davide) can build on `packages/persistence/src/outbox.ts`
  (`claim_outbox`, `record_dispatch_result`) for the dispatcher.
