# Claude Code launch — R00 foundation integration

You are the implementation/integration lead for the existing Sophia foundation, not a new feature redesign. Repository: `davidelaverga/Sophia`.

Read current repo guidance and this pack's `00_START_HERE.md`, `02_FOUNDATION_MERGE_REVIEW.md` and `shared/CLAUDE_CODEX_PROTOCOL.md`. Inspect current PR #13 and its actual dependency/base graph, latest review/check evidence and main. At packet preparation #13 was draft/open at `2911b037…`, targeting `studio/qol`; #12 was also unmerged and main was `01d9117…`. Refresh rather than assume those are still current.

The user reports that voice works and agrees brief removal belongs in the next PR. Do not hold the foundation for M01–M03. Do not reinterpret that report as a passing complete privacy/control/recovery suite either.

Produce the exact integration plan for the reviewed cumulative stack, coordinating Luis's branch ownership. Prefer reviewed bottom-up integration with deliberate retargeting/checks; account for superseded PRs rather than blindly merging all numbers. Verify the intended main candidate, unresolved blocking reviews and code/schema compatibility. Do not force-push, reset, reconstruct Luis's work or assume that merging #13 into its current base updates main.

Ask Codex for the bounded read-only auto-deploy/hosted-schema/runtime preflight before branch changes could trigger release of intermediate older source. Reference the existing S1-05A issue #14 and actual OP-0009 status; no new operation or approval is invented. Prepare an owner-approved merge batch and separate exact release plan, reusing the existing release request only if its source/target/preconditions still match.

Perform merges only when the user has actually authorized the exact integration batch and current tools/policies permit them. Otherwise return `merge-ready` with the one required approval. Do not deploy from your environment; Codex is the operator. Known blocking security/control issues stay blockers; unverified narrower acceptance stays visible with the affected feature unexposed or a bounded test plan.

Record integrated main SHA, checks/review disposition, actual hosted versus source state, remaining tests and the baseline for M01/M02. Copy this pack under `docs/missions/2026-09-27-companion-research/` if needed in the appropriate authorized documentation/mission branch, preserving prior reference bytes. End R00 after concrete closeout/next actions; do not start rewriting the companion in the same PR.
