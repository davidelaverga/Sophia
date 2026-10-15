# CON-01 takeover 74 — concrete checker and registry Stop crossing

Codex remains sole implementer; source-only expiry20:00Rome14October2026. Before-writing record198/6168592995. Published PR273 remains457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c. Corrected unpublished reply-child SHA2564fd3b06eaef821dd7dd375dc215dd2b1a6a511a36c89289f09cb863d0edea3be; tests90a687ac47e7705ca9d427bcb72ced4c89ef316732903b20cbc75f61dabe7b41. Initial sourcebf240131/tests3f995dc5 retained as failed-review evidence. Launcher39d3768c remains unchanged.

## Behavior

`replyHomeVerification` connects the existing registry checker callback to an owned Python process. Configuration supplies explicit absolute interpreter/script/replies/current-generation paths and bounded wait. It uses fixed `-I -B <script> check --replies <dir> --attempt <UUID>` arguments, no shell, cwd slash, no stdin/fd3, and an explicitly constructed environment containing only SOPHIA_REPLY_ROOT. Platform interpreter startup may add its own noncredential environment values; target qualification remains owed.

The adapter retains at most two concurrent checkers and refuses an already active attempt or conflicting scope before spawning. Stdout retention is capped65536 bytes and diagnostic bytes8192; diagnostics are discarded. Invalid UTF8, overflow, error, signal, nonzero exit, missing stdout/stderr EOF and abort all refuse proof. Actual close plus complete stdio is required before the underlying operation resolves. Abort/outer timeout does not kill by numeric PID, resolve early, free the active slot or accept a late zero. This preserves ReplyHomeChecks' active-operation guard until the process actually settles. A permanently stuck checker remains an unresolved owned condition requiring authorized recovery; no success or hidden replacement is invented.

Registry Stop still waits original accounting before invoking physical verification. Existing homeCheckPassed validates complete reports, roots and attempts. This slice exercises the adapter through that registry and dedicated receipt delivery, but does not install the production controller, change the goal queue, delete a home or enable Ask.

## Author evidence

Build/typecheck, whole-file structure audit with --no-ignore and git diff --check pass. Focused reply-child/reply-plugin suite252 passed, no failures/skips/cancellations. Seven new tests cover registry Stop→actual owned Python checker→real ServiceTransport→synthetic loopback HTTP acknowledgement; original child accounting blocking checker start; timeout/no replacement/late zero/refreshed check after close; malformed/truncated/duplicate/oversize/invalidUTF8/nonzero output; preabort/bad scope/absent executable; two-process capacity and direct abort; actual Python launcher refusal on the owned unadmitted fixture. HTTP is synthetic; this author result is not PostgreSQL/API authorization proof or Linux containment.

Initial suite had247passes/4failures, all positive fixtures. The fixture incorrectly asserted Python's environment would contain only the passed key and LC_CTYPE. A separate owned fresh-environment probe established that macOS's interpreter bootstrap adds SDK/CPATH/LIBRARY_PATH/MANPATH and a platform text-encoding variable. The fixture now proves an explicitly set synthetic ambient canary is not inherited; the source's fixed environment was not changed. Corrected251 pass, then252 with the actual checker refusal case. Fixture canary is restored, finite checker scripts self-exit and owned scratch/HTTP listeners have cleanup hooks. No real reply child, provider, credential or kernel filter was exercised.

Author evidence directory: checker-adapter-20261014-1242 under the takeover operator journal, including initial failures. Ordinary suite2611 passed/70 existing skips/zero failures or cancellations (33.683 seconds), session59901 terminal0. That initial pin was superseded by the independently corrected pin below.

## Independent finding and correction

First independent pass252 focused tests passed but an additional actual owned two-process probe reproduced P2: the exported adapter validated attemptA, then reread mutable caller scope as attemptB in deferred argv and cleanup. Both processes checkedB and A stayed blocked. Existing registry passes frozen scope, so no registry authorization escape was demonstrated. Finding198/6168730764 and independent-step4-checker-adapter-20261014/before-review.safe.json record the exact reproducer and limits.

After hold release, the adapter snapshots the validated attempt ID once for all admission/map/argv/finally operations. The module header now accurately mentions checker ownership. New actual Python regression checks distinctA/B output and A's slot release after both close. Corrected build,253 focused tests, whole-file structure and diff check pass. Corrected ordinary suite2612 passed/70 existing skips/zero failures or cancellations (33.468 seconds), session37607 terminal0. Independent recheck completed at the corrected pins; source/test hold released. This is not clearance from the earlier252-test pass.

## Final independent verification

The independent receipt `independent-step4-checker-adapter-20261014/after-review.safe.json` clears only the corrected adapter and registry Stop crossing. Independent253 focused tests pass; the original mutable-scope countercase passes after correction and fails by assertion with only the mutable-read bug restored. Three actual owned process probes establish that early pipe EOF, process exit with an owned pipe holder, and abort retain ownership until actual close and complete stdio. Whole-file structure checks pass. Removing the addition reconstructs the exact prior9ce38b9f source.

An owned local PostgreSQL17.6/Fastify crossing passed through the concrete Python checker, ReplyChildren.executeStop and ServiceTransport. Dropping the first HTTP response and retrying the same body produced one unknown receipt; a fresh check produced one checked receipt while preserving the original outcome_unknown answer. Exactly one retire and retire outbox remained, replay added no POST, and usage/reservations stayed zero. The checker report is synthetic L1, with durable claim separately seeded: this does not prove native process ownership, Linux containment or a serving controller.

Reviewer independently verified PG/test/checker processes absent, ports59428/59439/59440 closed and cluster/checker/private HOME/TMP removed. No active reviewer handles or unresolved fixture effects remain. Parent read the full final receipt before recording clearance. Ordinary2612/70 evidence is author evidence, separate from independent253 and the API/PG crossing.

## Boundaries, operations and handoff

Handoff73's bridge serial-queue Stop requirement is preserved: future execute insertion must retain asynchronous create work and return promptly; current ControlBridge still rejects all CON. Pending27 original-unit recovery,36 supersession, Q8/read-list/profile, shared-main integration and actual Linux qualification remain separate. All four relevant PRs remain last observed draft/open/unmerged/conflicting. No push/merge/shared artifacts changed; automatic273/6144338846 applies only to the published head.

OP0002r6 and OP0001r4 remain unapproved/not-ready drafts. No deployment, hosted migration/configuration, account/grant/connection termination, credential or provider execution. Product-provider use0; coding consumption unknown. The actual browser last shows owner account/project shell, Resources Coming; this is not immutable cohort or serving app/API/runtime proof. Acceptance ledger18partialL1/3passedL1/15not_run, A30not_run. Whole source_ready/combined reviewed/authorized/deployed/app_verified/owner_accepted remain unestablished.

Governed data untouched; no live rollback required. Unpublished source/receipts preserve source recovery. Unknown effects retain accounting and ownership; no allowance reset or cleanup receipt. No autonomous monitor.

Next bounded action: compose the permitted trusted controller path with a real dispatcher test that holds create admission while Stop fences it; preserve pending contract/profile/operation gates and default-disabled production behavior.
