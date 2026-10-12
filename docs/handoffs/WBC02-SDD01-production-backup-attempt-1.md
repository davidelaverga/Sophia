# Implementation-session handoff

Goal and attempt: WBC-02 / SDD-01 joint production continuation, private report-byte backups, attempt 1; quota repair attempt 2; upload-memory repair attempt 3; backup-off deadline repair attempt4.

Human owner / executor resource: Davide / Codex, one writer in the scoped worktree.

Native session: Codex task `01a10cf9-0fab-7561-9de4-702f30a511f4`; no new upstream native session opened.

Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-12/sophia-production-backups`; original preparation base `3c40b1c64eadaef56537a9e9123e71557cfd2a7b`, latest published source `7f28253acfa6bd56b788346f9f92c2a23d38def3`.

Ending commit/tree and changed files: last published source `7f28253acfa6bd56b788346f9f92c2a23d38def3`, tree `bd8deb829800b59a918ecb9862e8bbd809205ed4`. Attempt4's exact final source revision and tree will be sealed in PR #270's qualification attestation and the external hash-bound operator checkpoint after commit creation. An in-tree record cannot embed its own Git commit/tree hashes, which hash the record itself; the external immutable identities are required ending-revision fields. Scope: API byte-store/backup/quota modules and tests, renderer upload admission/route plus HTTP tests, operational binding and this handoff; no migration or shared CON runtime/Studio window.

## Outcome

The new optional API disk copy closes the gap between database backups and report object bytes. It remains **off by default**. The source behavior and all recovery/capacity limits are in [REPORT_BYTE_BACKUP](../coordination/WBC-02/REPORT_BYTE_BACKUP.md). A source pass is not deployed backup acceptance.

PR #270's automatic security review of `39665346e1b46a5ecfe3a1835aaccb59397f4639` identified repeated fresh capture keys filling the shared pilot disk. The repair reserves cumulative job/project/global byte and count budgets durably before copying, including failed/uncertain writes. Both validated PNG/PDF lease paths propagate the stable job UUID. SQLite admission runs in bounded workers with fail-closed deadlines and no report bytes or credentials. It changes no migration or capture-name retry protocol; upstream slot/claim accumulation remains outside this filesystem capacity guard.


Automatic code review of `d760703` then found unbounded snapshot/upload memory (`4252242225`). Attempt3 adds process-wide request-body admission before parsing, snapshot admission before copying, and holds each permit through the actual lifetime it protects. Body, whole-write and monotonic provider-step deadlines prevent late upload starts; an accepted remote write may remain uncertain. The quota-worker cap is two, counting timed-out workers until exit. See the operational binding for exact capacities and limits. This does not prove total API RSS or production fit.

Automatic code review of7f28253 identified the default backup-off branch returning raw S3 without write cancellation (`4252549677`). Attempt4 always uses the bounded write wrapper: optional disk copies alone depend on the setting. Without backup it retains original payload references, without snapshots/copies, under the same32MiB/two-write gate until actual S3 settlement. Native fetch receives an abort signal at the ten-second answer; an ignoring request stays admitted until settlement, and late HEAD cannot begin PUT. Earlier incoming controls/409 conflicts remain preserved.

## Evidence

From the scoped worktree, `npx --yes pnpm@11.7.0 check` on published attempt2 passed:2088 unit tests/70 skipped;86 integration tests/2 skipped, no failures/cancellations. Owned local PG17.6 HTTP suites (`node --test` for `design.db.test.ts` and `renderer.db.test.ts`) passed32; the cluster was removed and port55445 refused. Isolated attempt2 mutation baseline passed18 and four repairs failed with ordinary assertions when removed; no cancellation/import failure. Independent complete11-file review found no remaining actionable issue before that push. These results are historical attempt2 evidence, not qualification of the current amendment.

Attempt3 focused command `node --test apps/api/src/renderer-upload-admission.test.ts apps/api/src/byte-backup.test.ts apps/api/src/byte-backup-quota.test.ts apps/api/src/byte-store.test.ts` passed39 with zero failures/cancellations. It exercised actual local socket body timeout/disconnect and labelled fixture handlers, not live production leases. Exact-file Prettier/type-aware lint and API typecheck were run; the latest additional controls and monotonic deadline regressions passed in that39-test scope. Final frozen attempt3 full check passed2100unit/70skips and86integration/2skips, no failures/cancellations, and independent14-file review and11 ordinary assertion-failing mutations passed before7f28253 publication. The owned local PostgreSQL HTTP crossing passed32 again on12October21:20UTC and its cluster was removed/port55445 refused; its final-head disposition is sealed externally. Final source hashes and results belong to the immutable operator checkpoint rather than a self-referential in-tree commit claim.

Attempt4 focused command on the four files above passed41 with zero failures/cancellations/skips. It adds actual environment-factory backup-off HEAD/PUT abort/recovery and ignored-abort/late-HEAD capacity checks. Current final full checks, PostgreSQL storage-probe/HTTP crossing, mutation and independent whole-diff disposition are bound externally after execution and commit creation, not assumed from attempt3.

Private evidence outside Git, under `/Users/davidelaverga/.codex/operator-journal/joint-SDD01-WBC02/`: `resume-pr270-quota-final-prepush-checkpoint-20261012.json`, `resume-report-byte-backup-quota-independent-review-20261012.txt`, and `resource-cleanup-20261012/backup-quota-local-db-receipt.json`, `backup-quota-mutation-receipt.json`, `backup-pnpm-check-quota-r2.log`. No secret/log payload is copied here.

Consulted sources: repository `AGENTS.md`, `CONTRIBUTING.md`, session-handoff template; current byte-store/renderer routes and migration0039 capture slots/0044 claims; Node24 native worker/sqlite and Fastify5 content-parser/lifecycle implementation as installed under the frozen lock; actual GitHub automatic review findings above. No new provider API or upstream runtime binding is introduced.

## Decisions and changes

The user's 12 October instruction authorizes source completion without Claude, daily-backup preparation and automatic review after every push. Durable filesystem charges bound fresh-key abuse without changing capture-name retry SQL or refunding uncertainty. Process-wide memory gates and actual-operation settlement close the new finding across PNG/PDF, factory instances and delayed HEAD/PUT. No dependency/lock or runtime artifact changed. `sophia-runtime-wbc02-dev` remains the runtime unit; new voice qualification deferred.

## Remaining obligations

PR #270 is not merged or deployed. Attempt4 needs independently reviewed final bytes, complete checks/mutations/HTTP/storage-probe crossing, then fresh automatic review after push and an actual current-base merge-tree audit. The old failed reviewer concurrency CI remains failed evidence; PR #272 corrects that separate test assumption. Source success is not mounted-volume, S3 persistence, backup restore or 512 MiB production acceptance.

Production remains the separate final batch: retained API/dispatcher/runtime/bridge/Studio, reused renderer, private Paperclip, restricted permanent Supabase database/login and private storage, daily backups, access custody, migrations/rollback, cumulative $25/10-image allowance and direct native/app qualification. Legacy Render/Vercel cleanup has its own receipt. No new service/disk/credential, hosted recovery attempt, model/image call, migration or deployment occurred from these source amendments. Existing historical reports, uncertain effects and grants are preserved. G7 stays off and PR #190 billing P1s remain open; no Claude coordination dependency.

## Next bounded action

Codex completes attempt4 validation and independent review, pushes PR #270 and immediately inspects fresh automatic reviews. Qualify/merge #272 before #270 against the current main, then seal the final deployment tuple and operator inputs. No repeat of consumed hosted recovery authorization, unattended deployment or new access creation follows from this record.
