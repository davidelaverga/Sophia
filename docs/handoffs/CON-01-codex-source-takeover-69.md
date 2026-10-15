# CON-01 takeover 69 — internal per-attempt sweep

Codex remains sole implementer; Claude is stopped. The approved source-only window ends at 20:00 Rome on 14 October 2026 (18:00 UTC). All shared integration, contract, credential and operational restrictions remain. Before-writing checkpoint: issue 198 comment 6167758623.

## Candidate and behavior

Published PR 273 remains `457053b3fe619631f0d2e2fcc1e3edc98cfc5348`, tree `ec71aa3a83e6208ff559d075a881b374fdb8593c`. Unpublished launcher SHA256 `8ea74b4ff86be66beb61d0bec1b987baa61dda15ccbf76d04d7356984ac8f6bb`, tests SHA256 `bf6bfc0fb707a9d99aaebf21e723ae19bf3bfd2d9725934b4ad5ddfc06a2c40f`. The prior check command and parent execution path remain preserved. Source changes add the internal sweep composition, the standard-library select import and two truthful docstrings. Sweep CLI, supervisor wiring and provider execution remain unavailable.

`sweep_attempt` inventories all roots and homes before process effects. Duplicate homes refuse. Any older unsealed generation makes the pass unresolved without signaling. The explicit current generation remains required; no root is inferred or recreated. Root admission drains are held through the pass. An absent or empty home is only a filesystem observation and still requires the caller's spawn fence.

For a populated home, the sweep retains the private named lease, its complete bytes and metadata signature. A whole launcher/fork record is required. A busy life lock permits checking recorded identities, but never establishes settlement. A partial child record does not invent a child identity. Every checkpoint revalidates the lease, home, root namespace and original deadline. A changed snapshot aborts this pass rather than guessing whether an append is legitimate.

The sweep opens and retains the recorded child's and launcher's pidfds, verifies all five identity fields and signal-0 checks before any kill, and rechecks identity before each kill. The child is signaled before the launcher, using pidfd_send_signal only. ESRCH does not trigger a numeric signal or reopen. One deadline covers readiness waits and life-lock acquisition; late results refuse. A stopped result requires readable retained pidfds, an acquired life lock, successful descriptor closure and unchanged named evidence. A mismatch, failed signal or wait, unknown close, remaining lock, lease mutation or namespace change never becomes a stopped result. If an earlier signal already happened, that partial effect remains unconfirmed and no home is removed.

The sweep never deletes files, settles provider accounting, publishes a reply, supplies erasure proof or authorizes retirement. Complete all-attempt sweep enumeration, the operational adapter, generation seal, actual Linux qualification and shared caller integration remain unfinished. The caller still owes a bound for a stuck syscall and the current-generation spawn fence.

## Verification

Author commands: `python3 -I -B -m unittest discover -s apps/execution-host/reply -p 'test_*.py'` — 279 passed; `node --test --test-timeout=40000 tests/unit/reply-launch.test.mjs` — one passed; `git diff --check` — passed. Conservative AST checks of every new sweep function pass complexity 12, size 60 and arity 5 limits.

Nineteen new tests use owned synthetic homes and mocked process support, process identities, pidfds, signals, readiness and time. They cover child-before-parent order; every identity field; a late mismatch; ESRCH before and during signaling; missing/torn child record; held life lock; original timeout and late result; invalid readiness; lease changes before and between signals; namespace changes; unsealed generations; duplicate homes; incomplete lease; unsupported capability; descriptor-close uncertainty; absent/empty observations; and invalid arguments. Every test retains governed file content except explicit fixture-only setup/teardown. No actual Linux process inspection, signal, kernel containment, native harness or provider execution occurs.

The first author run had one incorrect busy-lock expectation: the test expected an unresolved row after exhausting the global deadline, while the final checkpoint correctly refuses the entire late report. The test now asserts the exact sweep_deadline failure and retained home, as the other timeout tests do. The implementation was not weakened.

Ordinary `pnpm test`, session 82661: exit 0, 2,604 passed, 70 existing skips, no failures/cancellations, 33.442 seconds. Independent exact-component review passed 279 Python tests, the wrapper and seven additional adverse groups: decode errors before signaling; a late launcher mismatch after the child signal; life-lock release under the original deadline; poll errors with both original descriptors closed; deadline during the first signal; independent open-file-description probes of the actual owned admission/life locks at the synthetic signal; and ESRCH without readiness remaining unsettled until timeout. Two isolated loaded-function mutations, omitting the life-lock wait or the fresh identity recheck, each produced one assertion failure and zero errors.

The reviewer reports no actionable finding in this bounded component and released the hold. Structure checks pass; prior functional AST preservation was verified with the previously reviewed clock/check-main changes explicitly accounted for. The initial private preservation assertion included main against an older snapshot; its accounting was corrected without a product-source change. All owned scratch and synthetic descriptors were cleaned; no active reviewer or author process remains. The receipt `independent-step4-sweep-20261014/review.safe.json` was read in full. This is not whole-Step4, Linux, physical-settlement or push clearance. Private author evidence: `sweep-attempt-20261014-1355` under the CON-01 takeover operator journal.

## Integration, operations and acceptance

Fresh `git fetch origin main --no-tags` confirms main remains `e2da7d89b5231ab27d7269b0a8100bedd1fa94fe`. The eleven previously observed integration conflicts remain held; no merge or conflict resolution is performed. Automatic review 273/6144338846 covers published `457053b3fe` only. Future pushes require whole-diff independent review and required gates beforehand, then actual automatic review of the pushed head. No push occurred.

Pending handoffs 27/36, Q8/profile and shared-owner integration remain held. Owner records 14/6132091412 and 31/6132091149 supplied no new handback at the last refresh. OP0002 r6 setup/human-chat and OP0001 r4 Ask remain draft, unapproved and not approval-ready. No account creation, hosted database/configuration/deployment, grants, connection termination, credentials or provider effects. Actual CON provider use is zero; coding/reviewer subscription consumption remains unknown.

The most recent actual-browser checkpoint still shows signed out. Tools work, but no signed-in two-account native-answer episode or serving app/API/runtime tuple is verified. Ask remains off. The 36-case acceptance ledger remains 18 partial L1, 3 passed L1 and 15 not run; A30 is not run. Whole source_ready, combined reviewed, authorized, deployed, app_verified and owner_accepted remain unestablished.

Unpublished source and exact receipts support source recovery; governed data is untouched, with no live rollback required. Any process uncertainty must retain the home and cumulative accounting. No monitoring or broader mission completion is claimed.

Next bounded action: finish all-attempt sweep enumeration and caller assembly within the approved source/ownership boundary. Actual target qualification and separately approved effect batches remain prerequisites for execution.
