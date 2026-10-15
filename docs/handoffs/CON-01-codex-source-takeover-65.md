# CON-01 takeover65 — parent-owned child settlement

Codex sole implementer; Claude stopped. Source-only approval remains through20:00Rome14October2026/18:00Z. Checkpoint198/6166802989; final component record198/6166912747. Pending27/36/Q8/shared integration and operation batches remain held. No actual fork, wait, signal, provider, deployment or account effect is authorized by this source change.

## Candidate and behavior

Published HEAD457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c unchanged. Unpublished launcher SHA256fcdcae19d6cdd523a89a09ee4b7753e6a4180d5b258a778b71e6c2266e8a3834/tests16732030ed62120f99344b4bb88e723998cc20a523f129dfcdbaef1c4e0acf4a. Previous helpers and wrapper unchanged. CLI69/Askoff; no operational caller.

ReplyChildReaper belongs to the caller's one fresh fork and optionally borrows its retained pidfd. It does not discover/adopt children or close a pidfd. Without pidfd it only uses waitpid for that child with WNOHANG and cannot signal. With pidfd it only uses waitid(P_PIDFD,WEXITED|WNOHANG) and pidfd_send_signal for TERM/KILL. It accepts only matching terminal exit/signal records. Terminal results are cached, never reaped twice; missing/invalid/error/timeout evidence is sticky unknown. ESRCH/ECHILD are not settlement. Interrupted waits preserve the original deadline. Bounded wait takes one absolute deadline no more than12s ahead (10s child setup plus2s margin), sleeps at most50ms and refuses late results; a second call cannot reset uncertainty. A successful signal is not settlement.

The future parent must construct this once for its owned fork and keep the borrowed pidfd valid, close the gate without approval on registration failure, and retain original life-lock/home ownership through settlement. These trusted caller prerequisites are not established by this helper or its constructor. No numeric signal fallback, gate opening, deletion, or publication occurs here.

## Verification

Author214 Python tests and wrapper1 pass, commands python3 -I -B -m unittest discover -s apps/execution-host/reply -p 'test_*.py'; node --test --test-timeout=40000 tests/unit/reply-launch.test.mjs. git diff --check passes. New wait/signal/clock APIs all mocked. Tests cover terminal success/nonzero/signal, cached reaping, own-child fallback, EINTR, ECHILD/ESRCH, malformed status/identity, expired/invalid/nonfinite/oversized deadlines, timeout and late result, failed signal, invalid requested signal/FD/PID. Actual Linux semantics remain unqualified.

Ordinary27047 terminal0:2604pass/70existing skips,0fail/cancel,33.4s. Independent214 Python/wrapper/five mocked adverse groups pass, no actionable component finding. An isolated cache-removal mutant yields one genuine assertion failure/zero errors. Structure complexity10/10/8/5/6/7 and size/arity bounds pass. Prior d3e25934 source preserved exactly by reversing this added block. Independent receipt independent-step4-child-reaper-20261014/review.safe.json read in full; source/test hold released. This is bounded component clearance, not full Step4 or push acceptance. Private child-reaper-20261014-1305 retains evidence. No new real process or background resource; assistant compute deduction unknown.

## Integration, operations and handback

Read-only fetch confirms main still e2da7d89b5231ab27d7269b0a8100bedd1fa94fe. PR199's latest record remains6165765212: current Studio preservation and11 held conflicts unchanged; no new handback or accepted combined candidate. Refreshed actual automatic PR273 review6144338846 explicitly names only457053b3fe. No push occurred; every future push requires actual automatic review after independent complete-diff review and required checks.

No migration/config/deployment/provider/account/grant/credential effects. OP0002r6 setup/human-chat and OP0001r4 Ask remain draft/unapproved/not ready. Read-only CUA checkpoint of existing hosted tab5 now shows “You’ve been signed out. Sign in again to continue.” Browser access works; no sign-in or form action attempted. Serving tuple and actual signed-in two-account/provider-backed acceptance remain unverified; authorized live episode must restore account access.36-case ledger unchanged18partial_L1/3passed_L1/15not_run,A30not_run. Full source_ready, combined reviewed, authorized, deployed, app_verified and owner_accepted remain unmet. No live rollback needed; source pins/private receipts preserve recovery, governed data unchanged.

Next bounded action: compose owned gate/status pipes, fresh fork, durable record/pidfd gate ordering and bounded exec-status/control loop using these reaping primitives. No broader mission completion or autonomous monitoring.
