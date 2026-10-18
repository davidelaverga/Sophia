# CON-01 takeover 7 — unfinished Step1 checkpoint, 13 October 2026

CON-01; human owner Davide; sole feature author/operator Codex, session
`01a1224a-32b4-7222-a017-50a277572d95`. Worktree
`/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-source-harness-review`,
branch `codex/con01-takeover-source-20261013`. This records unfinished local
source, not a new immutable Step1 pin or product acceptance.

## Authority and exact identities

The [source approval](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6133920949)
and [GO](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6133983482)
remain finite through **2026-10-13T08:00:00Z**. They cover the listed r12 local
source/draft scope, not hosted operations. R12 is PR271 commit
`7e6bf86bba728a6eb6ffb120815a2eb9cafb8f94`, tree
`eecae567d050db625d0f92ecbf519c6cfaf8ccae`; reservation SHA256
`c0d428a077fd7bdcadfec1c794861b0e784c43a41ab95a7c4067e15290f05307`,
research amendment SHA256
`2a07104b1501fa7d33330e8dae2d9270df53314a2b09be2ceb738c1fdd27b114`.

Davide approved [handoff5](CON-01-codex-source-takeover-5.md), SHA256
`c9a634b221537e2482f41fa39d24ba45240d2414c5a3823aaa1bb35342b8ab45`,
via `call_b4cbe46c7ed24b83bc43f092b00aef37` item0, “Approve amendment”.
[Shared authority record](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6134990227).
Its publication-privacy cancellation and sealed fixture helper are implemented
locally. It does not authorize capture to impersonate the publisher.

[Handoff6](CON-01-codex-source-takeover-6.md), SHA256
`c6c211886d56b45016093f4709aa2fedf149cfb9d45b2ce2538d91e2544c82a8`,
is **pending**, not approved. Its distinct `capture_privacy` cause, exclusive
capture caller and actual turn-end provenance are not implemented. R12 states:
“Nothing outside these lists is written. An unlisted need stops the writer,
and the list is amended and acknowledged again.” This is the reason the five
affected failures remain held; no dummy answer or weakened assertion is used.

| Identity | Actual value |
|---|---|
| Published PR273 / HEAD | `07d296ff3c2b58d597b31a2d15de0d48241c2dba` |
| Published tree | `69592cb3b988c14a282c623821b3b930960f5d4b` |
| Last independently cleared executable source | `1d8ac7501f8362d104c86988ee9bbf49030c0ef1`, tree `cce32c16bdb87cd8686bff7341942336a829ad21` |
| Authoring base | `32854caf01e7d5e493e096baead019506b1d1de3`, tree `28a1dfd28e7680d0517a1eb2d05034105defa96f` |
| Fresh remote main, observed 01:49:30Z | `97eae14cf9c2b9c8fb139cfbcf035fc8e4fbd173`, tree `9d26d6b9b78ce901a9d32d5a85780cc298ba8bdb` |
| Read-only merge-tree(main, published CON) | exit0, tree `3490c4e11844d519a43fd88b31d4f291729dd50a`; not checked out, integrated or tested |

No commit or push of the unfinished Step1 has occurred. The exact published
07d head's automatic Codex review was actually checked clear:
[273/6135020999](https://github.com/davidelaverga/Sophia/pull/273#issuecomment-6135020999),
summary completed `2026-10-13T00:07:00.894994Z`. That review does not cover this
uncommitted source. Every subsequent push still requires independent whole-diff
review before it and checking the automatic review for its exact head after it.

Fresh census examined all496 published refs/297 unique available candidates:
0049 and0050 absent;0053 appears only at07d and93e9313d, same approved blob
`669733650287beb2ae36bfd4e8c9606984a34f8d`. Main's new PR270 report-backup work
changes API/service transaction handling, not migrations, contracts, Studio or
the shared runtime. Its default `withService` call remains compatible by source
inspection; actual combined checks are still required. No reset/rebase/merge or
write to its owned files was performed. PR199 has no comment newer than
6131982774; earlier Luis dispositions remain as composed in handoff2.

## Exact unfinished source

SHA256 values below identify the source used by the final parallel PostgreSQL
diagnostic and independent bounded review; this handoff and navigation updates
were written afterward. All other code remains at the published head.

| File | SHA256 |
|---|---|
| `db/migrations/0049_conversation_runtime.sql` | `2308f77c5df18a85e3a5f6dab05d62d16dcd787251898db5df963c417fbdf912` |
| `packages/persistence/src/conversation-runtime.db.test.ts` | `587e47de0f1d4a6b1266e9bcfe689f1e4c9dee7821c389c363f542c63ec98c5c` |
| `packages/persistence/src/conversation-candidate-fixture.ts` | `565b310c8ab4a1b2ec4bf8390e7bec138f4fd9fca0d845e0ade26081654f3c16` |
| `packages/persistence/src/conversation-assembler-admission.db.test.ts` | `8a5168000a224ce01cbd09c448a94ea1fc54cec73a32a845b0223d4a3d7165b5` |
| `packages/persistence/src/conversation-assembly.db.test.ts` | `d325403b00b305b37b9b606ff374361c2dc7881078b1dc2d3e2181dd15a2e192` |
| `packages/persistence/src/conversation-fences.db.test.ts` | `8146a57a9065ee6919eb535590864618f7820ed3fe30e8d83841b280e89edc05` |
| `packages/persistence/src/conversation-ledger.db.test.ts` | `13ed9f744eefff9f772dd9e5559203cf25a77166978afe027bc7f2dd6da230fa` |
| `packages/persistence/src/conversation-reply-states.db.test.ts` | `84d6b5e9b2af0335a1cef7268d8d7bbaffd45309a88b9e0792233ceca60950c3` |
| `packages/persistence/src/conversations.db.test.ts` | `ea33f80697f0b6fbc583bc0dcf56526595082083f75dfb0d814d807918cb274d` |
| `packages/persistence/src/outbox.ts` | `671c7e081ee8d8a5e87606f70e3fa2210f7054999e953ec5b24a8b9ee7bd2b92` |

The append-only migration promotes frozen S1–S4 with only the approved named
exceptions; adds reply-owned attempts/outbox, closed execution/cancellation
records, cancellation/retirement, claim/go, admission, acknowledgement and the
five API-only runtime SQL entrypoints; replaces the seven shared functions only
at named insertions. Actual function-body restoration and attributes/ACLs are
tested. Goal paths, first receipt evidence, cumulative reservations and checked
cleanup precedence remain separate. The only product TypeScript change is
truthful nullable `outbox.goal_id`. API routes/wire/bridge/supervisor/isolated
homes are not implemented by this unfinished Step1.

The sealed test helper verifies47 baseline migration names/digests, including
0053, before database creation. Candidate/Q13 tests use it; promoted S1/S2 and
runtime tests use the full48-migration runner. A reproduced staging-removal
failure previously leaked the newly created database by losing its drop handle;
the helper now drops that database/roles before reporting the cleanup failure.
Tests assert the exact owned database/roles, not a cluster inventory raced by
parallel test files. Role/membership comparison uses one REPEATABLE READ
snapshot; the migration installs no role or membership. No shared helper edit,
criterion skip or baseline hash replacement was made.

## Executed checks and their limits

All receipts/logs below are private under
`/Users/davidelaverga/.codex/operator-journal/CON-01/20261012-takeover/`.
Each owned-cluster runner records full commands, dirty-file hashes, exit,
240-second outer bound, source stability and cleanup. PostgreSQL17.6,
Node24.21.0, pnpm11.7.0. All database records/route/credential references are
synthetic; no provider or native answer was executed in these SQL checks.

| Actual command/check | Result and receipt directory |
|---|---|
| `pnpm test:db`, normal parallel entrypoint, owned `C.UTF-8` PG | **852 tests:847 pass,5 fail,0 skip/cancel**, exit1,34.3s; `source-phaseb-ordinary-db-parallel` |
| `node --test --test-concurrency=1 --test-timeout=120000 packages/persistence/src/conversation-runtime.db.test.ts` | **78:73 pass,5 fail,0 skip/cancel**, exit1,7.5s; `source-phaseb-fixture-parallel-precheck` |
| `node scripts/db-test.ts` | exit0,48 migrations/five SQL test files; unchanged SQL2308f77, earlier test9ff898; `source-phaseb-full-sql-diagnostic` |
| `pnpm check` | exit0,238s; unit2353 pass/70 explicit skips, integration86 pass/2 compatibility skips, format/lint/build/types/contracts/artifacts passed; earlier testc3b888f/helpereda4173, same SQL2308f77; `source-phaseb-ordinary-check-diagnostic`. Later test/helper edits mean this is not a final current-source ordinary gate |
| Focused formatting/type-aware lint and persistence typecheck after the final fixture changes | exit0; terminal session62274, before both final PG runs |
| Independent selected mixed/catalog/capacity/fixture checks | **20/20 pass**, exact current three source hashes above; `independent-phaseb-mixed-catalog-capacity-20261013` |
| Independent actual API/worker closed grants | **1/1 pass**, same source hashes; `independent-phaseb-closed-grants-20261013` |

The five failures are privacy precedence for completed/blocked/error output,
and member-removal/audience-change capture. Correct intake has scrubbed the
answer; frozen publisher rejects empty/invalid/oversized output before its
privacy branch. Handoff6 proposes an honest distinct cancellation writer cause.
No full test pass, complete Step1 pin or independent whole-diff clearance is
claimed. Earlier fail-before receipts and reviewer findings remain retained.

Passing actual PostgreSQL crossings include human-only zero operational/model
records; crossed identities for all five wrappers; two concurrent replies and
durable third-slot denial across runtime replacement; current decision snapshot
and next-Ask current reads; source withdrawal and immutable first cause; both
stop receipt stage orders; all eight acknowledgement predicates with hidden
reserved/uncertain accounting and missing-marker refusals. Nine actual mixed
goal/reply batches preserve goal result markdown/hash/usage across answered,
failed, lease-lost, erased, withdrawn and cleanup states; replay adds nothing.
Catalog checks pin closed grants,45 frozen functions and seven shared bodies.
SQL hello preserves500 original goals plus0/1/2 replies; current500-only wire
readers remain unqualified until the later bridge/contracts step. Context setup
is owner-only synthetic S3 recording, not qualification of the eventual
least-privilege native assembler identity or host-copy lifecycle.

A serial full DB diagnostic in localeC had838/832/6, including an unchanged
research Unicode outline-anchor failure. That case also failed on the sealed
47-migration baseline inC and passed with current48 migrations inC.UTF-8.
The normal parallelC.UTF-8852-case run above has only the five held failures;
the earlier environmental failure is retained, not waived or fixed by relaxing
its criterion.

## Browser, integration and acceptance boundaries

Published07d browser CI jobs115062607730 and115062597714 both finished failure:
each1555 pass/1 fail/1 skip. Both fail `menu-scale.spec.ts:132`, assertion154:
Yesterday's `.menu-detail` expected “the pitch”, absent. An isolated existing
case passed1/1. Read-only local clock probes reproduce absent Yesterday at
00:30UTC and a different Yesterday detail at00:10, while noon has the pitch;
the fixture uses NOW minus1day42minutes. Truncated CI logs do not establish its
exact browser clock. No UI/test edit, assertion relaxation, CI rerun/cancellation
or full-browser pass claim. Luis handback: deterministic fixture clock with
the existing criterion retained; shared records198/6135976804 and6136039919.

| Readiness/gate | Actual verdict at this checkpoint |
|---|---|
| G0 | Settled optionC, throwaway home, Q13A, conservative withdrawal, conversation-text-v1 test cohort; subscription route/quota unqualified |
| G1 | Earlier published bounded181 PostgreSQL crossings retained; current unfinished full suite fails five G2 privacy cases; no hosted qualification |
| G2 | Partial L1 SQL only; capture held, no complete Step1, no native/provider/home/relay proof; Ask off |
| G3 | Earlier73 affected/119 preservation fixture passes retained; published full-browser CI failed; no real signed-in provider episode |
| G4 | Published automatic review checked; independent bounded new checks passed; unfinished whole-diff/current-main integration review and final gates pending |
| G5 | No authorized live effect batch, no verified serving tuple, no two-account live acceptance |

The36-case [retained acceptance ledger](../coordination/CON-01/receipts/codex-takeover-retained-acceptance.json)
remains18 partial_L1/3 passed_L1/15 not_run, SHA256
`b25c7f8c8ceb002c8139e1ec3ee5d8a08842a06ac9bc0493bb23fb79d48c1c3f`.
New bounded SQL evidence does not silently promote its app-level criteria.
`authorized` applies to source only; `source_ready`, `locally_verified` and
`reviewed` apply only to named completed slices/checks. Current unfinished Step1
is not source_ready/reviewed. `deployed`, `app_verified`, `owner_accepted` are
unestablished. Luis retains merge/integration and Davide product acceptance.

## Operations, privacy, unresolved effects and recovery

OP0002r6 setup/human-chat SHA256
`4ea475e83a44410c541f5e1f346545480faabc503c8c06d6b295672f44779206`
and OP0001r4 Ask SHA256
`661b196bb87f23bd52a683ad34921a3030010d6f9763a8d666b0d431bd3abdbf`
remain **draft_not_authorized**, not approval-ready. Approval references are NULL.
Exact final candidate/artifacts/target, two immutable account subjects/roles,
credential references, payer, finite allowances/expiry and recovery remain
unbound. User's proposed test email is not account-creation authority. No hosted
migration/config/deploy, account/member/grant/cluster privilege/connection
termination, credential read/copy/transfer, provider/subscription execution or
spend occurred. No PAYG, credits, provider switch, rotation or reset. No monitor.

Recorded runtime remains `sophia-runtime-wbc02-dev`, dsh
`639ed015397290b3745d163aafe02ffee4aa3f84`, v0.2.0-rc.2; unchanged artifact
digests linux `4552d08f78b47b7d0f16e79a92c487cffdfc5bb0a05eaef867c89ba837479a12`,
darwin `e24cb887c7a710069c2f2ac1dfa681611c25f129e39b990b09ce378aa133374c`,
bundle `b423d27eb70ef345137ee748a680a8664bb346786dbfb1ce6e7e6bb2193a8d19`,
lock `fef64ddaf4c3445fd3e83d8c27bb9f731b4378c846f86e093f543c69e6676ff8`.
These are source/artifact identities, not an observed serving app/API/runtime
tuple. Supported subscription topology, requesting account, adapter, credential
lifecycle, execution bounds and quota source remain unqualified. No personal
subscription sharing assumption. Earlier stopped-workflow consumption remains
unknown, not reset by this session.

Policy remains project-lifetime saved text subject to withdrawal/erasure and
stricter organization rules; conservative removal can include later same-chat
Sophia answers even if they did not use withdrawn content. Other humans, other
conversations and independently governed decisions stay bounded separately.
No automatic regeneration. Native throwaway-home cleanup/privacy withdrawal,
proactive grant-disable/member-removal hooks and exact Q13 activation remain
held qualification requirements. Cleanup failure is unresolved, never a
successful deletion receipt.

All root/independent disposable PG checks finished. Latest root PIDs10147/10250
absent, ports50888/50917 closed, clusters removed; latest reviewer
PIDs14514/14672 absent, ports55168/55266 closed, independently rechecked.
Owned Vite probes stopped; no5198/5199/5219 listeners retained. Private logs
remain outside Git. No live effect to roll back. Local rollback is omission or
reversion of this owned source; retain the uncommitted bytes and failure evidence
until reviewed. Future operational rollback must preserve governed saved data
and unresolved cleanup/accounting rather than dropping tables or resetting caps.

**One next bounded action:** resolve the already pending exact handoff6 amendment,
then implement only its approved capture provenance and rerun the five failures
within the existing08:00Z window. If it remains held, do not push a partial Step1
or start Step2. After completion, fresh-main composition, complete gates and
independent whole-diff review must precede publication and exact-head automatic
review. No broader product or other mission is marked complete.
