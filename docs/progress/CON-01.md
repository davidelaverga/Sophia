# CON-01 — saved project conversations: progress

The mission's one record of where things stand. Source, local tests, independent review, hosted operations and Davide's acceptance are kept apart. Evidence levels follow pack 07: **L0** source and static, **L1** local real API, PostgreSQL and pinned dsh with a labelled stub provider, **L2** authorized real provider, **L3** deployed app, **L4** Davide's acceptance. A level never promotes another.

| Item | Value |
|---|---|
| Coordination | [docs/coordination/CON-01](../coordination/CON-01/README.md), its [binding map](../coordination/CON-01/BINDING_MAP.md) |
| Coordination issue | [#198](https://github.com/davidelaverga/Sophia/issues/198) |
| Branch / PR | `claude/con01-project-conversations` / [#199](https://github.com/davidelaverga/Sophia/pull/199) (draft) |
| Base | `main` `4f7470c3ab7c158315934a11c8c620da663f4898` (tree `7d1472e3e61c707e6611015203ddec35f7ff5ce2`) |
| Implementer / reviewer | Claude Code `session_01KUDtFK9gWthsXSrepcLQz3` / Codex `01a1224a-32b4-7222-a017-50a277572d95` |
| Reservations | A16; migrations 0048–0050; runtime unit `sophia-runtime-con01-dev` (G2) ([binding map](../coordination/CON-01/BINDING_MAP.md) §1) |
| Approvals in hand | **None.** No saved-text policy, cohort, grant, provider allowance, migration, deploy or paid call is approved |

## Gates

| Gate | State | Evidence |
|---|---|---|
| G0 binding and policy | Revision 1 at `b00d07f`: changes requested ([CX-0002](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088652493)). Revision 2 makes the five corrections ([CC-0002](../coordination/CON-01/CON-01-CC-0002.md)); awaiting Codex's recheck and Davide's D-1 … D-6 and B-1 | [CC-0001](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088598535), CX-0002, CC-0002 |
| G1 durable human conversations | Intermediate candidate (CC-0003): migration 0048, A16, persistence, routes behind `SOPHIA_CONVERSATIONS`, real-PostgreSQL and HTTP tests. The Studio is not yet wired. The full ordinary gate (`pnpm check`) is pending | CC-0003 (below) |
| G2 read-only native reply | not started: option C preferred as direction; the impact inventory (§8.2) comes first; B-1 blocks activation | — |
| G3 Studio experience | not started | — |
| G4 combined candidate | not started | — |
| G5 operations and in-app test (Codex) | not started; no approval | — |

## Baseline (this session, at `4f7470c`)

| Command | Result |
|---|---|
| `pnpm toolchain:check` (Node 24.21.0, pnpm 11.7.0) | ok |
| `pnpm install --frozen-lockfile` | up to date |
| `pnpm test:db` (local PostgreSQL 16.15 via `SOPHIA_DISPOSABLE_DATABASE_URL`; Docker unavailable here) | 600 tests, 600 pass, 0 fail, 0 skipped |

## G1 intermediate: checks run (this session, local PostgreSQL 16.15, Node 24.21.0)

| Check | Result |
|---|---|
| `node --test packages/persistence/src/conversations.db.test.ts apps/api/src/conversations.db.test.ts` (real PostgreSQL, real Fastify and Ajv) | 23 tests, 23 pass |
| `pnpm test:sql` (all migrations, then `db/tests/*.sql`, including `0048_conversations.sql`) | 46 migrations, 5 test files passed |
| `pnpm typecheck` | exit 0 |
| `pnpm contracts:check` (A16 generated: 4 paths, 17 schemas, purely additive) | exit 0 |
| Prettier and type-aware oxlint on every changed TypeScript file | clean |
| Full ordinary gate (`pnpm check`: build, unit, format, lint, artifacts, integration) and the full `pnpm test:db` | **pending** at the intermediate |

## Acceptance (pack 07; every case starts `not_run`)

| Id | Case | Gate | Status | Evidence |
|---|---|---|---|---|
| CON-01-T01 | Separate conversations | G2/G5 | not_run | |
| CON-01-T02 | Correct authorship | G1/G5 | partial (L1 local: contributors are the writers of messages that are not withdrawn; Sophia part needs G2) | persistence db test |
| CON-01-T03 | Retention boundary | G0/G5 | not_run (policy proposed, D-1) | |
| CON-01-T04 | Current eligibility | G1/G5 | partial (L1 local: a withdrawn body leaves pages, contributors and the opening; request redacted; open replies cancelled; native and projection parts need G2/G3) | persistence and API db tests |
| CON-01-T05 | Account isolation | G1/G5 | not_run | |
| CON01-A01 | Atomic start | G1 | passed (L1, local) | persistence db test: a failure injected after the conversation insert leaves nothing |
| CON01-A02 | Lost create reply | G1/G5 | passed at G1 scope (L1 local; browser and app pending) | API db test: the connection dropped after the server answered; the retry returns the same records |
| CON01-A03 | Lost send reply | G1/G5 | partial (L1 local HTTP; browser part pending) | API db test |
| CON01-A04 | Changed payload same key | G1 | passed (L1, local) | persistence db test: title, text, ask, target, operation, withdrawal target (CX-0002.1) |
| CON01-A05 | Current membership | G1/G5 | partial (L1 local: viewer, outsider and removed member on list, page, cursor, write, replay and withdrawal; app pending) | persistence and API db tests; `db/tests/0048_conversations.sql` |
| CON01-A06 | Forged author | G1 | passed (L1, local) | API db test: actorId, name, author, projectId and replyTo in a body are 422; no Sophia message exists |
| CON01-A07 | Ordering and pagination | G1 | passed at G1 scope (L1, local; browser part pending) | 24 concurrent and 100 serial sends; pages without gap or repeat; another conversation's or a made-up cursor refused |
| CON01-A08 | No implicit invocation | G1/G2 | partial (L1 local: zero goals, attempts, bindings, commands, jobs, outbox, runtime commands or allowances; runtime spy at G2) | persistence db test |
| CON01-A09 | Exact response correlation | G2/G5 | not_run | |
| CON01-A10 | Runtime unavailable | G2 | not_run | |
| CON01-A11 | Original destination | G2/G5 | not_run | |
| CON01-A12 | Restart after admission | G2 | not_run | |
| CON01-A13 | Uncertain inference | G2 | not_run | |
| CON01-A14 | Current mission | G2/G5 | not_run | |
| CON01-A15 | Real quick answers | G2/G5 | not_run | |
| CON01-A16 | No mutation from conversation answer | G2 | not_run | |
| CON01-A17 | Summary coverage | G3 | not_run | |
| CON01-A18 | Projection race | G2/G3 | not_run | |
| CON01-A19 | Source injection | G2 | not_run | |
| CON01-A20 | Decision actions retained | G3 | not_run | |
| CON01-A21 | Output identity | G3 | not_run | |
| CON01-A22 | Draft and held write | G3 | not_run | |
| CON01-A23 | Read errors independently | G3 | not_run | |
| CON01-A24 | Mobile and accessibility | G3/G5 | not_run | |
| CON01-A25 | Privacy during read/stream | G2/G5 | not_run | |
| CON01-A26 | Partial and cancelled replies | G2 | not_run | |
| CON01-A27 | No collateral regression | G4/G5 | not_run | |
| CON01-A28 | Bounded context and spending | G2/G4 | not_run | |
| CON01-A29 | Rollback and erasure continuity | G4/G5 | not_run | |
| CON01-A30 | Actual app non-fixture proof | G5 | not_run | |
| CON01-A31 | Parallel ownership | G4 | not_run | |

## Findings

| Id | Severity | Gate | Finding | State |
|---|---|---|---|---|
| CX-0002.1 | P2 | G1 | Withdrawal semantic must name `messageId` | Bound (§4); 0048 has it; tests pending |
| CX-0002.2 | P1 | G2 | Fence project-source eligibility, also after publication | Bound (§8.3); not implemented |
| CX-0002.3 | P1 | G2 | Runtime operational copies and purge | Bound (§8.5); B-1 open for Davide |
| CX-0002.4 | P1 | G2 | Grant expiry and serialized aggregate; effort not approved | Bound (§8.4); not implemented |
| CX-0002.5 | P2 | G3 | Projection coverage fields and states | Bound (§3.1); not implemented |

## Next action

Codex reviews the G1 intermediate ([CC-0003](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088984254)) and binding revision 3 (CX-0003's two G2 corrections).

Claude continues in this order:
1. wires the Studio to the real local API (G1);
2. merges `main`;
3. writes the option C impact inventory for review before any G2 code.

Still open:
- Davide's D-1 … D-6 and B-1.
- #190's acknowledgment before any shared runtime write.
- No hosted text or inference until the cohort, policy, route, payer, finite caps, expiry and an exact batch are bound.
