# CON-01 takeover63 — child gate and pre-exec composition

Source-only authority remains20:00Rome14October2026/18:00Z, with all existing scope/privacy/spending restrictions. Codex sole implementer; Claude stopped. Checkpoint198/6166400475; final mission record198/6166537824. Pending27/36/Q8/shared integration and operations remain held.

## Candidate and behavior

Published HEAD457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c unchanged. Unpublished launcher SHA2567435111694256e660f808d05353bdb5119d75321375783e857a6a6854c5d8576/testseb6c5167ede4db5692dc935050a39f7fe4580499f35c141db42d1e40efdabb2b. Prior components/wrapper unchanged. No operational CLI caller; main still refuses69.

ReplyChildStart captures launcher PID, pipe endpoints and original descriptor binding. The owned child validates descriptor distinctness, arms alarm10, requires inherited default/unblocked SIGALRM, closes its gate-write/status-read ends, arms parent death and checks parent identity. It reads one exact gate byteG, closes the gate, and refuses EOF/wrong byte or uncertainty. No content open/write/exec occurs before approval. Pre-gate failure maps gate closure118/parent change119/other69 and exits without relay/status writes.

After approval, exec_reply_child builds the validated exact noncredential environment and argv, replaces stdin with the captured null device, applies Landlock/self-test then seccomp, finalizes descriptors, changes to private work/, disarms the alarm and executes pinned Node/entry/profile. No descriptor allocation or callback is introduced between finalization and exec. Any return/failure leads to a terminal child exit69; post-gate reporting is fixed, nonblocking, best effort on status pipe and relay, with no raw exception detail. os._exit prevents unwinding borrowed parent setup contexts. Signal/crash outcomes and actual reaping still belong to the parent.

This code has no fork caller, parent durable child record/pidfd/gate ownership or exec-status/reaping integration. It cannot establish settlement or cleanup, and the post-fork single-threaded ownership, exact target readlist/credential lifecycle and actual Linux/P7 remain unqualified. It introduces no provider route or authority and leaves Ask disabled.

## Verification

Author190 Python tests and wrapper1 pass. Commands: python3 -I -B -m unittest discover -s apps/execution-host/reply -p 'test_*.py'; node --test --test-timeout=40000 tests/unit/reply-launch.test.mjs; pnpm test; isolated mutation scripts; AST size/arity; git diff --check. Four mutants assertion-fail without errors: omit parent check, accept EOF, skip Landlock, omit alarm disarm. Owned copies removed. All new signals, pipe operations, exec, exit and OS effects mocked; no actual child/native/provider/kernel execution. Ordinary40907 terminal0:2604pass/70existing skips/0failed/cancelled. Independent190 Python/wrapper/five adverse groups pass at executable sourceb3e9fde4, no actionable findings, hold released. Complete independent-step4-child-lifecycle-20261014/review.safe.json read. Source then received only two docstring clarifications; non-docstring AST is exactly unchanged, independent doc-final-review.safe.json confirms exact reversal recovers the reviewed source, all outside-docstring bytes/tests unchanged. Receipt read in full; no repeat of unaffected tests, final hold released. All runs terminal and no resources retained. This component is locally_verified and independently reviewed at L1 only.

Private child-exec-20261014-1240 retains author logs/mutation receipts. No real new process-wide limit or confinement change. Assistant compute unknown. No push, merge, hosted migration/config/deployment, account/grant or credential/provider effect. Automatic273/6144338846 still covers only published457053b3fe; independent whole-diff and required gates before any push and actual automatic review after every push remain mandatory.

## Acceptance and handback

Actual serving tuple not newly observed. Fresh read-only main fetch remains e2da7d89b5231ab27d7269b0a8100bedd1fa94fe/tree930c188b2cf14be69f130bdc7cb070da0fc563b8, no new commits since handoff58. Studio preservation and last owner checkpoint remain in handoffs58/61; no new combined candidate or owner ACK inferred. OP0002r6 setup/human-chat and OP0001r4 Ask remain unapproved/not ready.36-case ledger unchanged18partial_L1/3passed_L1/15not_run,A30not_run. Full source_ready/combined reviewed/authorized/deployed/app_verified/owner_accepted remain unmet. Governed data unchanged; no live rollback required. Prior source pins and retained evidence preserve recovery; uncertain effects are not settled by source tests.

Next bounded action: parent-owned fork/pipe lifecycle, durable child identity and retained pidfd before opening gate, followed by exec-status/reaping evidence. Real target execution and application acceptance remain separately authorized. No broader mission marked complete; no autonomous monitor.
