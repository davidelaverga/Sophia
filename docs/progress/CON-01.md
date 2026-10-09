# CON-01 — saved project conversations: progress

The mission's one record of where things stand. Source, local tests, independent review, hosted operations and Davide's acceptance are kept apart. Evidence levels follow pack 07: **L0** source and static, **L1** local real API, PostgreSQL and pinned dsh with a labelled stub provider, **L2** authorized real provider, **L3** deployed app, **L4** Davide's acceptance. A level never promotes another.

| Item | Value |
|---|---|
| Coordination | [docs/coordination/CON-01](../coordination/CON-01/README.md), its [binding map](../coordination/CON-01/BINDING_MAP.md) |
| Coordination issue | [#198](https://github.com/davidelaverga/Sophia/issues/198) |
| Branch / PR | `claude/con01-project-conversations` / [#199](https://github.com/davidelaverga/Sophia/pull/199) (draft) |
| Base | `main` `4f7470c3ab7c158315934a11c8c620da663f4898` (tree `7d1472e3e61c707e6611015203ddec35f7ff5ce2`); `main` `71dbea3eb57f976c3b993285d45de917e59f204d` merged at `8f5cbea`, `6744e78` at `7660c73`, `6ef8d855` at `5c3866a`, `3e6d57b13ee8eabe62cb8e5e1d0ee2e7ebd76b3c` (#203) at `7e21538` |
| Implementer / reviewer | Claude Code `session_01KUDtFK9gWthsXSrepcLQz3` / Codex `01a1224a-32b4-7222-a017-50a277572d95` |
| Reservations | A16; migrations 0048–0050; runtime unit `sophia-runtime-con01-dev` (G2) ([binding map](../coordination/CON-01/BINDING_MAP.md) §1) |
| Approvals in hand | **None.** No saved-text policy, cohort, grant, provider allowance, migration, deploy or paid call is approved |

## Gates

| Gate | State | Evidence |
|---|---|---|
| G0 binding and policy | Revision 1 at `b00d07f`: changes requested ([CX-0002](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088652493)). Revision 2 made the five corrections; CX-0003 reviewed G1's binding at specification level. Revision 3 (`f4c2355`) made CX-0003's two G2 privacy corrections. Revision 4 binds the option C impact inventory into §8.2. Revision 5 makes CX-0009's two lifecycle bindings (§8.2.1 receipts, §8.2.2 ingestion). Revision 6 makes an uncertain or failed create terminal and fail-closed (CX-0012). Awaiting Codex's recheck of the G2 binding, and Davide's D-1 … D-6 and B-1 | [CC-0001](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088598535), CX-0002, CC-0002, CX-0003, CC-0004, CC-0007, CX-0009, CC-0008 |
| G1 durable human conversations | Server at `a7cc081` (CC-0005: CX-0006's race fixed). The full ordinary gate passed at `a7cc081` in a clean worktree. **Codex accepted the CX-0006 correction at L1 within G1 scope** ([CX-0007](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6089616601): 29/29 PG and HTTP at `95ea512`, the five SQL files, zero model or operational rows). The Studio on A16 (`95ea512`) awaits Codex's browser review. Not deployment or product approval | CC-0003, CC-0005, CC-0006, CX-0007 |
| G2 read-only native reply | No code. The option C impact inventory is written ([G2_IMPACT_INVENTORY.md](../coordination/CON-01/G2_IMPACT_INVENTORY.md)): goal paths fail open on a goal-less row, so reply-first branches and fail-closed guards are bound together (binding map §8.2). Revision 5 replaces six functions, not four: `apply_runtime_receipt` (the terminal path for outcomes with no `turn/end`) and `runtime_record_observations` (privacy-fenced ingestion) join them (CX-0009). Waits for Codex's review, Davide's D-6, the shared-window acknowledgments (#190's owner, the WBC-02/SDD-01 runtime owner; requested on #190). B-1 blocks activation | CC-0007, CX-0009, CC-0008 |
| G3 Studio experience | Part at `839fb45`: the saved-text notice, Withdraw and Remove, coverage words, honest context help. Corrections since, each published as its own source candidate: CX-0008 (`338878d`), CX-0010/0011 (`e11c19c`), CX-0013 and the PR review's three (`447e7ae`), CX-0015 and the contributor bound (`7660c73`), the erase key, feed notice, navigation and truncation (`4575dad`, `0f2f379`), and CX-0018's capped-list P1 (`54ee3de`, on `main` `3e6d57b`). **The scoped gate at `447e7ae` failed** (2 of 1131 browser tests; [receipt](../coordination/CON-01/receipts/447e7ae-scoped-gate.md)); no later head has a full gate. Projections, quick answers and `contextChanged` need G2 | CC-0007 … CC-0014, CX-0008 … CX-0018 |
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
| Full ordinary gate (`pnpm check`: build, unit, format, lint, artifacts, integration) and the full `pnpm test:db` | **pending** at the intermediate (`6092d93`). A gate I ran then over my working tree showed A16's JSON unformatted; that was corrected in `a7cc081` |

## G1 server at `a7cc081` (tree `ada2700`): the ordinary gate in a clean worktree at exactly that commit

Exit codes were written to a file by the shell, never read through a pipeline.

| Command | Exit | Result |
|---|---|---|
| `pnpm check` (toolchain, format, lint, build, typecheck, contracts, unit, artifacts, integration) | 0 | Unit 2096 (2095 pass, 1 skipped); artifacts match linux-x64; integration 101 (99 pass, 2 skipped) |
| `pnpm test:db` | 0 | 626 tests, 626 pass, 0 skipped |
| `pnpm test:sql` | 0 | 46 migrations, 5 test files passed |
| The two conversation suites with the CX-0006 race regressions | 0 | 26 tests, 26 pass |

## G1 Studio wiring (the commit after `a7cc081`)

| Check | Result |
|---|---|
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (whole repository) | exit 0 each |
| Studio unit tests (`node --test "apps/studio/src/**/!(*.db\|*.live).test.ts"`) | 1012 tests, 1012 pass |
| Luis's 12 conversation browser suites against the fixture pages, which now serve A16 shapes, desktop and phone. Local Playwright 1.63 config launching this container's Chromium 141 (`/opt/pw-browsers/chromium`): the pinned headless shell 1243 is not installed here | 115 passed |
| Other browser suites touching conversations or the nav: app-auth, knowledge-honest, knowledge-origins, project-connections, report, spaces-honest, type-scale | 114 passed, 1 failed under load (app-auth lens restore: a 5 s sign-in wait). Not reproduced: app-auth alone with `--repeat-each=3` gives 45/45 |
| **Real local episode** (L1: real API with `SOPHIA_CONVERSATIONS=on`, PostgreSQL 16.15, Studio dev build with `VITE_SOPHIA_CONVERSATIONS=1`, `dev-db.ts` synthetic identities, project setting written by the operator function) | Davide starts «Onboarding direction» (POST 202) with Ask off. His asked message is recorded with its request `blocked`, said under it. Luis contributes. After Davide reloads, every message is read back from PostgreSQL ("You, luis@sophia.test"). Vera (viewer, 390 px) reads, with no composer and no New conversation. A second and third conversation keep separate histories. The composer says "Sophia doesn’t answer here yet" and offers no quick ask while `capability.ask` is unavailable |

## G3 slice at `839fb45` (tree `fcf069e`)

Run in this session with each exit code written by the shell, never through a pipeline.

| Check | Exit | Result |
|---|---|---|
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (whole repository) | 0 each | — |
| Studio unit tests | 0 | 1012 tests, 1012 pass |
| The 12 conversation browser suites, desktop and phone (the local Playwright config with this container's Chromium 141) | 0 | 115 passed |
| **Real local episode** (L1: the real API with `SOPHIA_CONVERSATIONS=on`, PostgreSQL 16.15, the Studio dev build, `dev-db.ts` synthetic identities) | — | Davide is offered Withdraw on his own message and nothing on Luis's (he is not an admin), and withdraws. Luis (admin) removes Davide's other message. Vera (viewer) reads both as withdrawn and is offered no press. In PostgreSQL both rows have `body` and `author_name` NULL (`withdrawn_by` `author` and `admin`) |

## Acceptance (pack 07; every case starts `not_run`)

| Id | Case | Gate | Status | Evidence |
|---|---|---|---|---|
| CON-01-T01 | Separate conversations | G2/G5 | not_run | |
| CON-01-T02 | Correct authorship | G1/G5 | partial (L1 local: contributors are the writers of messages that are not withdrawn; Sophia part needs G2) | persistence db test |
| CON-01-T03 | Retention boundary | G0/G5 | not_run (policy proposed, D-1) | |
| CON-01-T04 | Current eligibility | G1/G5 | partial (L1 local: a withdrawn body leaves pages, contributors and the opening; request redacted; open replies cancelled; in the Studio an author withdraws, an admin removes, a viewer reads both as withdrawn; native and projection parts need G2/G3) | persistence and API db tests; the G3 local episode |
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
| CX-0002.5 | P2 | G3 | Projection coverage fields and states | Bound (§3.1); A16 carries them; the Studio says them (`839fb45`); generation needs G2 |
| CX-0006 | P1 | G1 | `conversation_locked` read membership before the project lock, so a revocation committed while waiting was missed | Fixed at `a7cc081` (membership read again once the project's row is held), with bounded SQL and HTTP race regressions; accepted at L1 within G1 scope (CX-0007) |
| CX-0007 (CI) | — | all | #199's CI is red at `95ea512`: the SQL, PDF, Media and Paperclip jobs failed pulling images (Docker Hub rate limits) before any test ran | Recorded as infrastructure failures, **not** as passing tests; not waived; no reruns started |
| G2-INV-1 | P1 | G2 | Goal-reading SQL fails open on a goal-less row (`native_delivery_ineligible`'s epoch and Hold/Stop fences pass on NULL) | Bound: reply-first branches with fail-closed `g.id IS NULL` guards (binding map §8.2, revision 4); not implemented |
| CX-0008 | P2 | G3 | A successful withdrawal or removal drops the focus to the page | Fixed at `338878d`, with browser cases (the focus test fails without it) and the real API (own, admin, 390 px, a delayed reply) |
| CX-0009.1 | P1 | G2 | A rejected create emits only a receipt; capture never runs, so the reply would never settle | Bound: `apply_runtime_receipt`'s reply branch and its receipt-only tests (binding map §8.2.1, revision 5); not implemented |
| CX-0009.2 | P1 | G2 | Late observations could write withdrawn text back after the scrub | Bound: privacy-fenced ingestion under the writers' lock order, scrub in place, usage kept, with order, delay, batch and replay tests (§8.2.2, revision 5); not implemented |
| CX-0009.3 | P3 | G2 | §8.3's transitive reproducer read as tested | Labelled a required test, not yet run (revision 5) |
| CX-0010 | P2 | G3 | Opened while out of reach, Try again restores the project but not a failed membership: an editor is shown no controls | Corrected at `e11c19c`, then by CX-0013's correction at `447e7ae` |
| CX-0013 | P2 | G3 | `e11c19c`'s `useProjectMembership` asks again without end when only the membership read keeps failing (its own failures re-trigger it: a refetch with no data passes through `pending`) | Corrected at `447e7ae`: asks again once per new project read. Browser case (bounded requests, then back with a later read); real API bounded and stable |
| CX-0011 | P2 | G3 | Feed first: the focus is on the page until the withdrawal's HTTP reply | Corrected at `e11c19c` (armed as the press is made); browser case and real API |
| CX-0012 | P1 | G2 | Revision 5: an uncertain create's late resolution had no coherent path | Bound in revision 6: terminal and fail-closed, no receipt revives a reply, hello lists unretired bindings `stopped`, uncertain spend kept until an operator reconciles it, restart-and-replay tests; not implemented |
| PR-R133 | P1 | G3 | A withdrawal left its derivatives in caches (the list's last message, Sophia's answers that read it) when the reads after it failed. Codex reproduced the list case on the real app | Corrected at `447e7ae`: the pages and every list redacted synchronously before the re-reads |
| PR-R144 | P1 | G3 | No Studio caller for A16's conversation erasure | Corrected at `447e7ae`: an admin's Erase this conversation (D-3 still open) |
| PR-R151 | P2 | G3 | The list's `more` discarded: a capped list read as whole | Corrected at `447e7ae`: `more` kept and said (A16 has no list cursor) |
| G3-BYLINE | P3 | G3 | A run of messages whose first is withdrawn reads «A member» as its byline, though later messages in it name their writer | Corrected at `4575dad` (a withdrawn message never heads a run) |
| PR-R310, R321 | P1, P2 | G3 | A withdrawn writer stayed named when the reads after it failed; contributors were unbounded past A16's 200 | Corrected at `7660c73`: redacted synchronously; at most 200 named, the reader always among them; 201-writer PostgreSQL case. Codex rechecked both on the real app |
| PR-R398 … R411 | P2 | G3 | The erase key lost with its part; feed-seen erasure unannounced; a late reply navigating away; truncation lost on withdrawal | Corrected at `4575dad` and `0f2f379`; Codex rechecked the key, the notice and the navigation on the real app |
| CX-0018 / PR-R406 | P1 | G3 | A list of the newest only (`more`) leaving the conversation out was taken as its erasure: «erased» said falsely and its draft forgotten (reproduced on the actual app) | Corrected at `54ee3de`: only the erasure's reply, or a whole list read now, settles it; the settled intent is released and never brought back. Browser case fails without it. Awaits Codex's recheck |
| A08-RECEIPT / PR-R415 | P2 | G3 | A message's «it's in Still open» after its proposal was decided, or after a failed reread | Owned by `main` #203 (`3e6d57b`), merged at `7e21538`; CON-01's parallel rewrite reverted. A CON-01 browser case checks #203 with Accept and a failed reread |
| 447-GATE | — | all | The scoped gate at `447e7ae` failed: Personal contrast (passed 3/3 alone) and report C9 (fails alone on `main` `6ef8d855` here) | Recorded as failed, not waived ([receipt](../coordination/CON-01/receipts/447e7ae-scoped-gate.md)) |

## Next action

Codex rechecks `54ee3de` on the actual app (CX-0018's falsifier, #203 with Accept and a failed reread, a late erasure reply after the feed settled it). Claude runs the focused and full Studio browser gates on it, then the whole `pnpm check`, and reports each exit as it is.

Codex reviews binding revision 6 before any G2 schema or runtime is written. No G2 code is written before that review and the shared-window acknowledgments.

Still open:
- Davide's D-1 … D-6 and B-1.
- #190's acknowledgment before any shared runtime write.
- No hosted text or inference until the cohort, policy, route, payer, finite caps, expiry and an exact batch are bound.
