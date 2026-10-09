# CON-01 independent reviewer/operator handoff — attempt 1

## WORKFLOW_END_TO_END_TRAILER

Initiating user behavior: Davide assigned Codex independent review from G0, authorized preparation/discovery, requested exact approved deployment and real signed-in testing of saved project conversations. No actual end-user conversation was submitted by this attempt.

Authoritative identity: repository `davidelaverga/Sophia`; reviewer session `01a1224a-32b4-7222-a017-50a277572d95`; Claude session `session_01KUDtFK9gWthsXSrepcLQz3`; shared issue [#198](https://github.com/davidelaverga/Sophia/issues/198); draft [PR199](https://github.com/davidelaverga/Sophia/pull/199). No live CON-01 project/conversation/message/request was allocated.

Crossings actually exercised: real local PostgreSQL and existing API tests under synthetic identities; fixture browser only; read-only hosted database metadata and authenticated Render/Vercel dashboards; actual Studio reached but at sign-in. No ordinary test-account authenticated CON-01 crossing, model call or deployment was exercised.

Durable result: independent baseline inspection, material G0 findings posted before schema/runtime freeze, revision-2 binding rechecked, operation draft and 36-case ledger prepared. No hosted records or controls changed. Native host/payer/retention/cohort and paid authorization remain unbound.

Verdict: **partial review; live/app acceptance blocked**. Next falsifier: immutable G1 candidate independently admits one authorized human-only start, refuses an unauthorized read/write/replay, and changes zero operational/model rows. That is the next local crossing, not an authorization to activate hosted retention.

## Recovered identity and candidate

- Original `Sophia-Agent` cwd is a non-Git August Python snapshot. The actual repository was recovered at `/Users/davidelaverga/Documents/Codex/2026-08-19/pl/Sophia-browser-account`, branch `fix/studio-browser-account-stores`, head `2144bb0231b4d684eb19091161579cb490528920`; left untouched.
- Review worktree `/Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-review`, branch `codex/con01-review-attempt-1`, original base main `4f7470c3ab7c158315934a11c8c620da663f4898`, tree `7d1472e3e61c707e6611015203ddec35f7ff5ce2`. Codex changes review/evidence/runbook files only.
- Claude branch `claude/con01-project-conversations`. G0 original `b00d07f4de292c9f8981b0360ffd9a0eb48b181e`, tree `90cd8387c195302a6b0703f41994bcd6bd203c15`; reference-only `eda98dbda098a379e99e53f66b556c6389880c69`; revision 2 `c703b2df259bf414e28eeb48d5c5e8b39f330cf8`, tree `e4fd211f3904298779b021148cc7cc232081cadd`. G1 SQL/routes exist only in Claude's unpublished local work at this checkpoint, and are not qualified here.
- Main advanced to `5489bd2ab9c78253554ba1811312b692a62c9c3d`, tree `d0027632e403ab2b9522e7476965a02e56e3c4ab` (#196 demo-board fixtures). Review branch retains its pinned base. Current-main fixture integration remains required before G3/G4.
- PR190 is SDD-01 G7 source/default-off, not v3 installation. Last refreshed head `f2a6d8183aa96e685cf761ca0c93565f1243bc6e`; A15 and 0046–0047 remain that lane's. WBC/SDD PR107 already merged. No competing installation or old production batch was run.
- CON-01 proposed IDs: A16, 0048–0050, `conversation-text-v1`, `sophia-conversation-v1`, `sophia-runtime-con01-dev`. They are not deployed objects; shared runtime owner acknowledgment and current-main integration window remain required.

## Readiness facts

| Fact | Verdict | Evidence |
|---|---|---|
| source_ready | No feature candidate yet | Published heads reviewed here are documentation only |
| locally_verified | Baseline only | 74 focused tests, 52 real PostgreSQL tests, 3 destination-map tests; fixture browser |
| reviewed | Partial | G0 G1 specification direction reviewed; G2 privacy details/inventory and B-1 remain open |
| authorized | No | OP-0001-r1 is a draft with required nulls; no approval reference |
| deployed | No CON-01 deploy | Existing mixed service tuple observed read-only |
| app_verified | No | Real Studio presents sign-in; two accounts/provider path unavailable |
| owner_accepted | No | Davide's policy, route/spend and final product decision remain open |

## Feedback and remaining findings

[CX-0001](../coordination/CON-01/CON-01-CX-0001.md) records actual source/UI bindings and independently reproduced baseline timestamp settlement (F1) and coverage ambiguity (F2). Both still require implementing candidate tests.

[CX-0002](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088652493) reviewed b00d07f: withdrawal target, project-source privacy fence, operational native copies, finite grant and coverage binding. Claude returned c703b2d; all five are addressed in the specification or explicitly blocked, not implementation-verified.

[CX-0003](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6088757330) rechecked c703b2d. Remaining G2 corrections are full project-scope/audience eligibility and transitive provenance when a summary is reused in a later prompt. Native persisted-session cleanup B-1 remains an activation blocker. Option C is architectural direction subject to impact inventory and owner D-6. This attempt did not author any feature correction.

## Commands/actions and evidence

At reviewer base `4f7470c`, Node 24.21.0 and pnpm 11.7.0:

| Actual command/action | Result and limitation |
|---|---|
| Pack validator; independent Git blob comparison against supplied ZIP | Validator: 36 cases, 28 checksum entries, 26 links, three references, zero errors. All 29 installed pack files byte-identical at b00d07f |
| `pnpm install --frozen-lockfile`; `pnpm toolchain:check`; `pnpm contracts:check` | Passed; no backend system-Python tests used |
| `node --test apps/studio/src/features/conversations/*.test.ts apps/studio/src/app/auth-callback.test.ts apps/api/src/auth.test.ts` | 74 passed, zero failures/skips; baseline F1 still independently reproduces |
| Owned PG17.6 cluster; `node --test --test-concurrency=1 --test-timeout=90000 packages/persistence/src/mission.db.test.ts apps/api/src/mission.db.test.ts apps/api/src/runtime.db.test.ts` | 52 passed, zero failures/skips. Existing A08/runtime baseline only. Server stopped in `finally` |
| `node --test tests/unit/destination-map.test.mjs`; `git diff --check` | 3 passed; whitespace check passed |
| Vite fixtures on isolated port 5299, browser at 1440/1000/390 | Three panes 300/840/300; tablet Context focus/Escape; phone list-first, no horizontal overflow, reachable Send. Fixture evidence only |
| Actual Studio browser, Render/Vercel read-only dashboard | Sign-in, existing serving deployment IDs; no application write/login selection |
| Read-only PostgreSQL metadata using existing credential-store reference | PG17.6, schema through0036, no checksum drift, six m03 `running` bindings; not proof of actual live work or ordinary app authorization |
| GitHub issue comments and direct CON-01 Claude messages | Material independent findings delivered before G2 freeze; no unrelated task messaged |

Restricted evidence: `/Users/davidelaverga/.codex/operator-journal/CON-01/attempt-1/{baseline-postgres.py,baseline-postgres.log,baseline-postgres-receipt.json,live-readonly.mjs,live-readonly.json}`. Baseline install/unit/contracts logs also exist under `/tmp/con01-*`. No credential values or real private transcript are copied into the repository.

The [36-case independent ledger](../coordination/CON-01/acceptance.independent.json) retains every required case with `not_run` and precise missing evidence; baseline observations are separate. No case is waived by attractive fixture output or source-only declarations. A21 positive output evidence remains open unless an actual eligible association is available; no association was fabricated.

## Operation request, live tuple and limits

[CON-01-OP-0001-r1](../coordination/CON-01/CON-01-OP-0001-r1.json) is **draft_not_authorized**. Candidate, exact artifact/schema hashes, ordered executable commands, policy approval, cohort, selected provider route/credential/payer, finite caps, expiry, recovery identity and owner approval are null/unbound. The user was asked for the designation facts; no answer is assumed. Do not request approval of this incomplete draft as though it were executable.

[LIVE_PREFLIGHT](../coordination/CON-01/LIVE_PREFLIGHT.md) records the exact fresh dashboard observations:

- API `srv-daqrn08473hc73flhi8g` / `dep-db0h6jad0e5s73bkine0` / source `1e912b7ec83e55694de33d9ced1e4c8d915db4d6`.
- Runtime `srv-darvmse0tbcc73d8kh3g` / `dep-db02hcou01pc738k4atg` / source `6ec64f36aae1fe60dfd4d54a21f861901ba7d630`.
- Worker `srv-darv7snpn0mc73e6c240` / `dep-dasrio7pn0mc739nnetg` / source `0391bc66b8dc47f4268b6f785e11de182ff5d7e0`.
- Media bridge `srv-darvcigu01pc73e24o4g` / `dep-db0h7rc9v7es73bed57g` / source `1e912b7ec83e55694de33d9ced1e4c8d915db4d6`.
- Studio production `dpl_2ocnSuyh2Pbmvwf7RLtnj4upEyT1`, Ready/manual upload; source SHA unproven.
- Database observed at `2026-10-09T20:17:14.172Z`, migrations0001–0036. Runtime installed profile/config/artifact digests, actual process roster and full serving tuple remain unproven.

Actual mission provider use: **zero calls, $0 spend, $0 uncertain provider spend**. No CON-01 allowance exists; this is not a remaining approved balance. No hosted write/migration/deploy/grant/retention activation/stop/purge or destructive fault injection occurred. Read-only API health checks may wake a free service but do not invoke the model. No new paid resources were provisioned.

Privacy limits: synthetic local fixtures only; live metadata only; actual project text never collected. Saved-text/admin/derived-suppression policy and native host cleanup decision remain owner proposals. Provider/backup limitations require actual references before activation.

## Cleanup, rollback and next action

Owned PostgreSQL process stopped and its disposable cluster removed after `pg_ctl status` confirmed it stopped; the restricted receipt records cleanup. No other mission's cluster was touched. The fixture Vite process exited 0 on interrupt; all four reviewer-created browser tabs were closed and the viewport override reset. Review worktree and restricted evidence are retained for recovery. No CON-01 live pending write/reply/permission/control exists. Historical six m03 bindings remain untouched and require the other operator's reconciliation before any cutover.

No hosted rollback is needed because no hosted effect occurred. Historical service versions/Render rollback buttons are available observations, not proof of compatibility with future conversation data. Before release, rehearse disabling new grants/writes while retaining governed reads/erase/control, journal/allowance lineage and additive data. Never restore an old runtime that resurrects prompts or drops privacy enforcement.

**One next bounded action:** Claude publishes the first G1 implementation/test commit and the corrected G2 binding/inventory on issue #198; Codex independently runs the real PostgreSQL/API success/negative crossing and human-only counters against that immutable candidate. The live operation remains blocked until Davide supplies the missing designation/policy/spend facts and approves the completed exact batch. No automatic monitoring or promise of unattended future work is created. Other missions and the broader product remain open.

## Continuation: G1 candidate, independent race and correction

This section supersedes the earlier candidate/next-action checkpoint while preserving its historical observations. [CX-0005](../coordination/CON-01/CON-01-CX-0005.md) records direct verified desktop coordination. Claude published6092d934/tree74df931c; the reviewer independently passed23 published real-PG/HTTP tests and separate human-only durability/refusal/counter probes, then reproduced a membership-revocation race at the SQL withdrawal boundary. [CX-0006](../coordination/CON-01/CON-01-CX-0006.md), issue comment6089025000, requested the smallest correction. No feature fix was authored by the reviewer.

Claude returneda7cc081e/treeada27003 (post-lock membership recheck and regressions), then95ea5126/tree8b4f68da (Studio/API wiring). Main71dbea3e/treec14e05ef is integrated. The reviewer switched only its own clean detached candidate worktree to95ea5126 and independently passed29/29 PG/API/probe tests, zero skips/cancellations, and an additional4/4 probe run executing all five actual SQL boundary files. [CX-0007](../coordination/CON-01/CON-01-CX-0007.md), issue comment6089616601, accepts the SQL correction within that exact scope. The unchanged race fails on6092 and passes95ea. The HTTP route refused/preserved the body even on6092 through same-transaction RLS readback; no HTTP exploit is claimed.

Actual commands: frozen pnpm install in the detached candidate; `node --test --test-concurrency=1 --test-timeout=90000 packages/persistence/src/conversations.db.test.ts apps/api/src/conversations.db.test.ts <independent-probe>` through the restricted `candidate-postgres.py` harness; then the independent probe with SQL suite added. The [independent source](../evidence/CON-01/CX-attempt-1/g1-independent.test.mjs) is runnable from the candidate repository root. Restricted journal receipts/logs retain exact candidate/tree/commands and cleanup. Every owned PostgreSQL server is stopped and cluster removed. No running fixture server or live model process was started in this continuation.

G1 backend is **source_ready / locally_verified / bounded reviewed** for the recorded crossings; UI and native behavior remain unqualified. Three acceptance cases have their required L1 evidence; others retain partial/not-run status and their full required scope. The broader feature is not reviewed/authorized/deployed/app_verified/owner_accepted. The operation request remains draft_not_authorized with the prior required nulls, no operation approval and no exact production candidate/artifact commands. Provider calls/spend/uncertainty remain0. Serving tuple was not changed or silently re-observed.

PR199 remains draft. No formal/inline automatic review was present at the inspected95ea checkpoint. Several CI jobs failed before test execution on Docker Hub pulls (SQL/PDF PostgreSQL16, media LiveKit, Paperclip PostgreSQL); full job IDs and evidence are inCX-0007. Required CI stays failed/pending; no waiver, credential change or repeated rerun occurred. Claude's reported full gate at a7cc081 is author evidence, separate from our independent tests. Current PR190 work continues and has not been modified.

**Next bounded action:** independently review Claude's forthcoming immutable G3 slice plus G2 impact inventory/corrected binding, and exercise the Studio in the built-in browser against its real local API. Finish G2 usefulness/privacy/accounting and combined G4 review before preparing an executable production batch. Actual two-account hosted app proof still needs Davide's designation/policy/route/credential-ref/payer/finite allowance/expiry and exact approval. Rollback remains the governed read_only settings design, locally exercised; no hosted rollback was executed. No autonomous monitoring was created.

## Continuation: real-local G3, recovery faults and G2 revision 4

Exact G3 candidate839fb45b378a4f22517e4bf940372c6734f558ef/treefcf069e806d2ca852c2b76855f81f7731e13d708 was frozen in the detached candidate checkout for both owned local stacks. Frozen installation passed. The built-in browser exercised actual Studio/API/PG17.6 with synthetic admin/editor/viewer/nonmember identities, VISION unset and no fixture/runtime/provider. [G3_LOCAL_BROWSER](../evidence/CON-01/CX-attempt-1/G3_LOCAL_BROWSER.md) records actual actions and durable database/process receipts.

Successes: separate conversations and drafts, send/return/reload, attributed viewer reads and denied nonmember access, preserved desktop/mobile layout and Context/Escape behavior, explicit separate A08 Propose/Accept reflected in another tab, withdrawal bodies NULL and refreshed tombstones, blocked Ask with no work, and controlled loss of one actual API Send response body followed by same-key retry yielding exactly one message. Actual API replacement retained all messages, keys and operational counts. Human-only and blocked asks produced zero jobs/attempts/commands/outbox/runtime commands/usage; the one goal was the test-support seed. Both stacks exited0; owned PG servers stopped/clusters removed/databases dropped; API/Studio children stopped; tabs closed/viewport reset. No live fault injection occurred.

Two independently reproduced UI corrections remain open: [CX-0008](../coordination/CON-01/CX-0008.md), comment6089742649 (successful own withdrawal/admin removal drops focus to BODY), and [CX-0010](../coordination/CON-01/CX-0010.md), comment6089875924 (after a startup API outage, project Try again restores data but not the separate failed membership read; only full reload restores editor controls). Claude acknowledged CX8 and is preparing a bounded focus fix with author fail-before/pass-after tests. Its unpublished work is not reviewed evidence. CX10 was sent to the verified CON-01 desktop session and was queued at the checkpoint. No product fix was authored by Codex.

G2 inventory revision4 is documentation-only ad8dcafe7177020b49cc13b30ee9dcb0731e5bc3, main71dbea3e. [CX-0009](../coordination/CON-01/CX-0009.md), comment6089780887, requests two pre-implementation binding corrections: receipt-only rejected creates must settle their job-less reply/accounting without waiting for a nonexistent turn/end; and privacy-fenced observation ingestion must prevent late buffered text from restoring erased native-observation copies. Exact existing source crossings were independently inspected. Claude acknowledged both and is preparing revision5, including additional reconcile/cleanup concerns it found. No G2 code/execution is qualified. Shared ownership remains open; PR190 refreshed at f885459f2bbd39ca396a4e9068eae6b48fe342ee, draft, not an acknowledged shared runtime window.

Readiness remains distinct: G1 backend bounded source_ready/locally_verified/reviewed; G3 partially locally_verified with two failed UI crossings; G2 proposed/changes_requested; combined feature neither reviewed nor authorized/deployed/app_verified/owner_accepted. The full acceptance ledger retains required hosted/native arms. CON-01-OP-0001-r1 stays draft_not_authorized with its missing owner designations/policy/route/credential-ref/payer/caps/expiry/commands/artifacts and no approval. The prior live serving tuple was not changed or refreshed by these local tests. Mission provider calls/spend/uncertainty remain0; no hosted migration/config/deploy/grant or other mission effect. Governed hosted rollback remains to be rehearsed against the eventual exact combined artifact; no hosted effect currently needs rollback.

**Next bounded action:** fetch Claude's immutable focus/recovery corrections and G2 revision5; independently recheck the changed UI with delayed replies and viewer/nonmember controls, then review the revised receipt/ingestion/retirement bindings before G2 runtime/schema finalization. No unattended monitoring or broader-product completion is promised.

### Focus correction recheck at338878df

Claude published338878df8ac0e0cfc219b80af3728830d0dd7673/tree6e2051fc76bebdb5a8ba32bb2fe26a7fd24ee99c. Codex reviewed its complete eight-file diff, switched only the stopped clean detached candidate checkout and passed frozen installation. In a third actual local Studio/API/PG stack, ordinary own withdrawal now focuses the exact withdrawn P. A delayed response after deliberately moving to the composer preserves its new draft. However the independent proxy delayed only the actual withdrawal HTTP response by3000ms while forwarding the real project event stream: feed-first own withdrawal and admin removal still drop focus to BODY until the response arrives. [CX-0011](../coordination/CON-01/CX-0011.md), issue comment6089954674, records the precise remaining ordering case; Claude acknowledged that landing is armed too late and is preparing an author correction, with CX10 recovery work. Its current unpublished source is not accepted.

[Tool-observed focus results](../evidence/CON-01/CX-attempt-1/g3-focus-338-observations.json), [durable records](../evidence/CON-01/CX-attempt-1/g3-focus-338-browser-db-audit.json), [wrapper cleanup](../evidence/CON-01/CX-attempt-1/g3-focus-338-browser-stack-receipt.json) and [child/database cleanup](../evidence/CON-01/CX-attempt-1/g3-focus-338-browser-stack-cleanup.json) preserve exact identities. All three test-message bodies are NULL; zero operational records/provider use. Owned stack exited0, PG stopped/cluster removed, disposable DB dropped, API/Studio stopped, tabs closed. No source changed during testing. G2 revision5 remains forthcoming; CX9 and owner decisions still open. Readiness, live operation limits and next bounded action above remain unchanged. The reviewer evidence checkpoint728564f6fc8ed3b611d845a7a59c8af0cb1a05c5 was already pushed before this recheck.

PR199 review checkpoint after338: no formal GitHub reviews and no bot/@codex request comments were returned. Its first-attempt push run37996274664 and pull_request run37996279054 both name exact338878df and remain in_progress. Their SQL/PostgreSQL16, live-auth, runtime-unit and real-LiveKit jobs are successful; fixture Chromium/PDF and Paperclip jobs remain in progress. This supersedes the historical95ea CI failure observation only for this exact new head; it is not a full green gate or independent hosted verification. The queued source corrections will require fresh affected review/CI and an automatic review request at their immutable head.

Subsequently Codex requested the automatic PR review in [PR199 comment6090022625](https://github.com/davidelaverga/Sophia/pull/199#issuecomment-6090022625), explicitly naming current338878df/tree6e2051fc, the G1 implemented/G2 proposed distinction and known CX9/CX10/CX11 findings. The request names reviewer evidence42817057132b599b321f361eeb58692f03054845 and asks the bot to report the actual reviewed commit if the branch advances. This is a review request, not a completed review or approval; inspect its returned findings at the next source/review checkpoint. A new affected source change invalidates that part of any earlier result.

### Completed automatic review, revision5 and further independent probes

Automatic review5475809173 completed2026-10-09T22:09:16Z on exact338878df, with P1 cached withdrawal derivatives [r4234938133](https://github.com/davidelaverga/Sophia/pull/199#discussion_r4234938133), P1 missing whole-conversation erasure UI [r4234938144](https://github.com/davidelaverga/Sophia/pull/199#discussion_r4234938144), P2 discarded capped-list signal [r4234938151](https://github.com/davidelaverga/Sophia/pull/199#discussion_r4234938151). All sent to the verified CON-01 Claude desktop session; none waived or declared fixed. Claude's CX10/CX11 correction e11c19c is local/unpublished under its full gate; a separate author worktree is preparing erase/cache/list changes. No source reviewed here was edited while the reviewer stacks ran.

G2 documentation-only949a6e4ecf68c7c2ccb9e6d07f27752da8f8e4c5/treeb180ccaab29059e5294f86e975134f2016d0da0e received independent [CX-0012](../coordination/CON-01/CX-0012.md), [issue6090136849](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6090136849): receipt and ingestion directions are corrected, but uncertain-create recovery is contradictory across lost binding/hello, scrubbed observations and running-only publication. Claude acknowledged and is preparing a fail-closed revision6; no immutable revision6 or G2 code was qualified at this checkpoint. Shared PR190 current head was refreshed to0483d40aceb98fd59f1112355e7964a6da9470fd, main remains71dbea3e; this is no shared-writer approval.

[CX-0013](../coordination/CON-01/CX-0013.md), [issue6090183080](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6090183080), adds exact338 independent evidence. A new synthetic actual HTTP/PG17.6 identity probe passed1/1 with zero skips: rename same-key receipt, same-email distinct JWT subjects, project-key namespace, outsider and cross-project denials; operational/model records0. T05 is partial_L1 only, with actual account/browser/native/hosted scope still open. The reused PG package lacked bootstrap files; a reviewer-owned exact17.6 registry package and official symlink hydration resolved the harness. No other lane's installation was changed; failed bootstrap attempts started no server and their empty directories were removed. Successful owned cluster stopped and removed.

A fourth real-local built-in browser episode independently confirmed bot r4234938133: after a successful own withdrawal, the actual database body is NULL and thread is a tombstone, but the list retains the withdrawn words when the loopback test proxy refuses subsequent conversation GETs with503. Restoring reads and list Try again removes them. This is a failed privacy cache crossing, not successful acceptance. No Sophia-derived-answer arm was fabricated. API/Studio/PG stopped, disposable database dropped, cluster removed, stack exit0, test tab closed. Durable audit/receipts are linked fromCX13. Screenshot emitted through CUA without a returned saved file path.

Operation request remains draft_not_authorized with the same unresolved designation/policy/provider/payer/cap/expiry/artifact/command values and no approval. Serving tuple remains the historical read-only tuple above, not freshly verified or changed. Provider calls/spend/uncertainty remain0. Readiness is bounded G1 backend reviewed, G3 partially verified with open corrections, G2 proposed/changes_requested, combined feature unreviewed/unauthorized/undeployed/not app_verified/not owner_accepted. Rollback has not been executed and must preserve governed data in the eventual exact batch. No live cleanup or uncertain external effect exists from these tests. No other mission or broader product is complete.

**Next bounded action:** independently inspect immutable revision6 and the next published UI corrections; rerun affected focus, outage-membership and privacy-cache crossings, then complete G2 real native/context/usefulness/accounting and G4 combined-source review before requesting approval of any executable production batch.

### Independent recheck at a247 and normalized G2 binding at565

Source a247b7896a53c5d4b8acf5966f0fc556d082ce18/tree21b3a2e8d35ae2de7ebae36ca203c5e38d7d7ba2 includes e11c19c's focus/membership corrections while its author full gate remains pending. The reviewer safely switched only its stopped clean detached candidate worktree, passed frozen install, and exercised a fifth owned actual local Studio/API/PG episode. [CX-0014](../coordination/CON-01/CX-0014.md), [issue6090255016](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6090255016), records the bounded focus acceptance and new P2 regression.

Own withdrawal and separate admin removal correctly focus their exact tombstones287ms/304ms after press, before their actual HTTP responses held3000ms; moving to a new draft during a third held response preserves TEXTAREA focus/draft after the response. All3 bodies NULL/semantic requests redacted, zero operational/model records. Persistent membership-only503 while snapshot succeeds causes unbounded retry cycles without new UI action (8→20→34 failures); source effect retriggers at the same snapshot timestamp when its own query failures recur. Controls remain fail-closed; lifting the fault restores them. Claude acknowledged and is correcting the retry latch in a separate worktree. Full original all-API outage recovery and current viewer/nonmember arms still require the final corrected source; no partial pass hides this failure.

Actual commands/actions: frozen checkout/install; finite owned g3-browser-stack.py with exact owned PG17.6 package; built-in browser synthetic editor/admin sign-in and human-only writes; test-only loopback membership503 counter and withdrawal HTTP-only3000ms delay; database audit; browser-stop; close2 tabs. Stack exit0, API/Studio stopped, disposable DB dropped, PG stopped/cluster removed. Audit, cleanup and observed-count/focus receipts are linked fromCX14. No source changed during these tests, no provider/native/hosted effect, no remaining owned process or live uncertain effect.

Normalized G2 revision6 is documentation-only565165f5894168f5e73b7d0a59e84320716fc36b/treea8ea0ab0ab462d268c59963e3d3a3cb004284d06. Independent source review confirms the fail-closed uncertain-result direction and the receipt/ingestion/hello/state/accounting normalization address CX12 at specification level. G2 execution, preservation tests, assembled native context/tools, actual useful provider answer and host erasure remain unqualified; D-4/D-6/B-1 and shared-window acknowledgment remain open. Current detached candidate remainsa247, whose feature source equals565; reviewer source only is separate.

Automatic review still only qualifies its reported338878df source and has3 open findings; later affected source needs fresh review before merge. Latest independently inspected949 pushrun37997416883 reports SQL, LiveKit, live-auth and PDF successful, Chromium in_progress/runtime queued. This contradicts the author's overbroad comment6090204071 claiming Docker failures at every head; the reviewer sent exact correction evidence. Historical failures remain failures, current successes remain successes, no full-green claim/waiver/rerun loop. No merge attempted.

Readiness/operation limits remain unchanged: G1 backend bounded reviewed, focus crossing independently accepted, G3 partially locally_verified with retry/cache/erase/list corrections pending, G2 specification direction reviewed only, overall not reviewed/authorized/deployed/app_verified/owner_accepted. CON-01-OP-0001-r1 remains draft_not_authorized, with no executable exact batch, no approval and missing designated project/two real account subjects, policy/host-erasure choice, route/credential reference/payer/finite caps/expiry. Historical serving tuple unchanged/unrefreshed. Calls/spend/uncertainty0. Hosted rollback remains to be rehearsed against the future combined artifact; no hosted cleanup required. Other missions and broader product remain open; no autonomous monitoring created.

**One next bounded action:** obtain Claude's immutable bounded-retry/cache/erase/list correction and independently rerun affected actual-app crossings, then request/check fresh current-source automatic review. G2 native proof and exact combined G4 review must precede the executable production operation request and final owner approval.
