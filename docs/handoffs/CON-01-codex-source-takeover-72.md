# CON-01 takeover 72 — explicit frozen-template digest command

Codex remains sole implementer; source-only expiry20:00 Rome14October2026. Before-writing record198/6168288873. Published PR273 remains457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c. Unpublished launcher SHA25639d3768c11fb02bb9bc7499e4517b34d662b27faf53323e266c71a06fe1ca9e5; tests83e0b1761e2b01973e01b155fa00218c4d2e11e6557d15f7695c436127a1866a.

## Behavior and scope

The specified `digest <dir>` command requires canonical explicit template and existing `SOPHIA_REPLY_RUNTIME_DIR` binding. Main reads only that named variable for digest and only the existing generation variable for check/sweep. Missing or malformed scope returns64 before scanning. The dispatcher uses a closed table to preserve check/sweep behavior without growing repeated branches.

Digest reuses the unchanged bounded frozen-template inventory and versioned recipe: sorted no-follow entries, content/execute bits and exact link targets. Absolute links remain lexically restricted to the explicit runtime; their targets are never opened. Writable/unsafe trees and ambiguous scans refuse. One30-second cooperative deadline covers scanning and result validation; it is not a substitute for the caller's external timeout on stuck syscalls. Only a valid versioned SHA256 plus newline can be printed. Scan errors, late results, short writes and flush failures return74 with a fixed token. Partial output is not success. No template install, profile rewrite, permission mutation or credential discovery occurs.

Run and probe remain disabled. This command does not prove installed profile compatibility, child containment, provider routing or actual host-copy erasure.

## Verification

Author312 Python tests and wrapper1 passed on first run. Seven added tests exercise the exact owned frozen-tree digest with an unvisited absolute runtime link, malformed scope/no scan, writable tree and escaping link rejection, original deadline expiry, fixed errors/invalid digest output, short/write/flush failure, and only named command-specific environment access. The historical bare-digest case now expects malformed64 and no stdout instead of unavailable69. Existing check/sweep cases pass through the refactored dispatcher. New functions meet complexity12/size60/arity5 limits; git diff --check passes.

Ordinary suite passed2604 with70 existing skips, zero failures/cancellations (33.626 seconds). Independent review passed312 Python tests, wrapper1, five adverse groups and two mutation checks (one assertion failure each, zero errors). Three actual owned CLI subprocesses verify exact independently computed mixed-tree recipe hash, missing-binding64 and writable-template74; advancing time during actual recipe encoding refuses the late result. Twelve prior dispatcher cases matched previous return codes/stdout/stderr, and other prior function bodies match the original AST. No actionable findings; source/test hold released. All owned subprocesses joined and scratch removed. Independent receipt: `independent-step4-digest-cli-20261014/review.safe.json` under the takeover operator journal. Author receipt/logs: `digest-command-20261014-1226` under the takeover operator journal. No external template, credential, kernel filter, native runtime or provider was used.

## Operations, readiness and recovery

No push, merge, shared artifact/profile edit or deployment. Last actual automatic review273/6144338846 covers only published457053b3fe; next push still requires independent whole-diff gates and its actual automatic review. Current-main integration and eleven conflicts remain held; main freshly fetched and unchanged at e2da7d89b5231ab27d7269b0a8100bedd1fa94fe. Owner records14/6132091412 and31/6132091149 refreshed: no new handback; silence is not approval. Luis/Studio preservation remains199/6165765212; A08 and other missions unchanged.

Pending27 accounting-unit and36 poll-supersession amendments remain unapplied and unapproved, as do Q8/profile/shared integration requirements. Setup/human-chat OP0002r6 and Ask OP0001r4 remain unapproved/not-ready drafts with candidate, approval and expiry unset. No hosted migrations/configuration, accounts/grants/connection termination, credentials or provider execution. CON provider use0; coding consumption unknown.

Ask disabled. Hosted browser last signed out; serving app/API/runtime tuple and two-account native-answer episode remain unverified. Acceptance ledger18partialL1/3passedL1/15not_run, A30not_run. Whole source_ready/combined reviewed/authorized/deployed/app_verified/owner_accepted remain unestablished. Unpublished source and review receipts retain source recovery; governed data untouched, no live rollback needed. Unknown execution/accounting remains retained. No autonomous monitor.

Next bounded action: finish permitted launcher/caller composition while preserving the explicit selected-read-list/profile and contract gates. Real Linux qualification and exact effect-batch approval remain required before execution.
