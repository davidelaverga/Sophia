# CON-01 takeover60 — descriptor role binding

Source-only renewal is approved through 2026-10-14T18:00Z / 20:00 Rome. Request CON-01-SOURCE-WINDOW-20261014-R1 and renewal-approval.safe.json retain the exact expiry-only decision. Existing r12 scope and approved amendments apply; pending27/36, Q8, shared integration and operational restrictions remain held. Codex implements; Claude remains stopped. Existing independent reviewer supplied the separate validation below. Checkpoint198/6165903096; final mission record198/6166064736.

## Candidate and behavior

Published HEAD457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c unchanged. Unpublished launcher SHA256 1c45685ba6156fe63dece8fb3f8059697b4b26ec0c9fd6b04530fc1e7b66fe5a; tests5177d6371a266ba1ffef8b6b673e50355b000b12229191a7fc03bff4733df709; wrapperf513bedcf811dbf912e515e0e4205c7e41c07f9f3218eb88d0173aa90b8001e9 unchanged.

Capture binds redirected stdout/stderr to their private named diagnostic files, connected distinct control/relay sockets, writable status pipe and private retained lease. Stable metadata excludes size/timestamps so legitimate diagnostic growth and parent lease append do not invalidate identity. The post-gate child input helper verifies the captured null device before replacing stdin; finalization checks roles before and after descriptor closure. All new OS operations were mocked. No CLI caller, fork, exec or containment installation is enabled; CLI remains69 and Ask stays disabled.

Independent review found P2: replacing a named diagnostic during the last setup checkpoint left retained descriptors unchanged and incorrectly allowed capture. Correction rechecks both named diagnostics against their original roles after that checkpoint. Original reproducer now refuses; stdout and stderr siblings are covered. Stat identity does not establish open-file-description identity or lock ownership: the trusted caller must retain the original life-lock resource across fork. Parent append/gate/status/exec and no-allocation-through-exec composition remain unfinished.

## Verification and effects

Commands: python3 -I -B -m unittest discover -s apps/execution-host/reply -p 'test_*.py'; node --test --test-timeout=40000 tests/unit/reply-launch.test.mjs; pnpm test; isolated mutation scripts; AST size/arity audit; git diff --check. Author and independent163 Python tests plus wrapper1 pass. Corrected ordinary session55738 terminal0:2604passed,70existing skips,0failed/cancelled. Four isolated mutants assertion-fail: omit pre-input verification, post-closure verification, named binding, and final named comparison. Owned mutant trees removed.

Independent after-review.safe.json records four additional adverse groups, both late named replacements and unchanged original repro refusal; no remaining actionable finding in this bounded component. Source/test hold released, all runs terminal, no retained live resources. Receipts reside privately under roles-20261014-1210 and independent-step4-descriptor-roles-20261014. New process/kernel/native/provider/hosted/account/credential effects: zero. Assistant compute not measured. No push; automatic review273/6144338846 remains evidence only for published457053b3fe. Whole-diff review and ordinary required gates precede any push; inspect actual automatic review after every push.

## Readiness and next action

This component is locally verified and independently reviewed at L1. Full source_ready, combined reviewed, operational authorized, deployed, app_verified and owner_accepted remain unmet. Last observed main e2da7d89/tree930c188b and its Studio preservation remain recorded in handoff58; eleven integration conflicts remain held. No new serving app/API/runtime tuple is asserted. OP0002r6 setup/human-chat and OP0001r4 Ask batches remain unapproved/not ready. Acceptance ledger remains36 cases:18partial_L1,3passed_L1,15not_run; A30not_run. Physical Linux/Node/P7 and actual two-account application acceptance remain unqualified.

No live data changed; no live rollback or cleanup was required. Prior source pins and private receipts preserve correction history; uncertain execution remains unresolved by policy. Privacy, subscription and finite allowance requirements remain unchanged; no provider spending authority exists. Next bounded action: implement the approved containment-installation source seams with mocked syscall tests, then independently review; actual Linux execution requires its separate qualified target and authority. No broader mission completion or autonomous monitor.
