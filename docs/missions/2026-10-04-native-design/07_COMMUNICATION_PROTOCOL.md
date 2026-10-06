# Claude Code ↔ Codex communication protocol

**Retained protocol:** `sophia.dev-handoff.v1.1`. **Mission profile:** `sophia.native-design.v0.1`. This is a bounded extension for M75/SDD-01, not a new product A2A service. Read the actual existing protocol in the repository. [SRC-S4](sources/SOURCE_REGISTER.md#src-s4)

## 1. Authority and writers

Claude owns application/runtime implementation, migration authorship, generated contracts/locks, local tests, PRs and fixes. Codex owns independent review, isolated verification, authorized hosted operations and real-app tests. Claude may use disposable local databases. Codex alone applies approved hosted migrations/configuration/releases.

Codex's default source scope is read/test/report. If a bounded fix/support patch is explicitly assigned, give it a separate `codex/*` worktree/branch and an exact path list; Claude reviews/integrates it. Never edit the same files or worktree concurrently. Evidence files can be returned as a separate commit or approved artifact for Claude to integrate.

Neither agent can approve its own hosted request. Davide owns product/merge/release/spend decisions; existing repository reviewer requirements remain. Shared GitHub login text is not proof of human approval. An actual owner instruction or independently verified approval reference is required.

## 2. One thread per mission

M75 uses existing issue **#31**, with `M75-*` IDs and PR #75 links; do not restart old M03 operations. SDD-01 uses one actual newly created owner-authorized coordination issue, linked from its new PR and `docs/coordination/SDD-01/README.md`. If an existing issue already has the same mission, reuse it instead of duplicating it. Unallocated IDs remain null in templates.

Messages are append-only. A correction has a new ID and `supersedes`; do not overwrite prior claims. Claude IDs: `<mission>-CC-####`; Codex: `<mission>-CX-####`; findings: `<mission>-RF-####`; operations: `<mission>-OP-####`. Allocate from the actual thread and detect collisions.

A PR comment may carry a brief pointer to the coordination message. **A comment does not wake an idle coding agent.** A user or an actually installed authorized trigger launches/resumes it. Do not build perpetual polling or another orchestration platform for this protocol.

## 3. Message envelope

Use `templates/HANDOFF_MESSAGE.yaml`. It retains protocol, mission, message and stable operation IDs, revision, source/target, candidate/base, reply/supersession, scope and evidence. For a release, use the separate execution request with exact approval/target/resource fields.

Valid kinds include `inspect_request`, `support_request`, `review_request`, `review_finding`, `prepared`, `execution_request`, `result`, `blocked`, `cancel_requested`, and `reconciled`. `review_request` uses the retained support-request semantics with an explicit independent-review payload; older clients can encode it as `support_request`.

Operation states remain: received → prepared → authorized → started → effects_observed → verified / failed / outcome_unknown. Message delivery, task acceptance, effect completion and result quality are separate evidence.

## 4. When to communicate

At launch, register role, real session identity where safe, toolchain, actual worktree, writable scope and capabilities. At every gate, Claude sends one bounded review packet, Codex returns findings/verdict, Claude fixes and sends a new exact candidate, and Codex verifies the fix and relevant whole diff.

Check the thread before dependent work, before release and at meaningful checkpoints. During an active session, bounded checks may be useful; no empty paid loops, repetitive acknowledgments or indefinite waiting. Continue independent permitted work when another step is blocked. When nothing useful remains, checkpoint and return one precise blocker.

## 5. What Claude sends for review

Send exact base/head, scope and changed-file list, acceptance IDs, effective assets/recipe/tool identities, tests already executed and their evidence, unresolved questions and the smallest requested review action. For SDD-01 include the source-to-native parity matrix and proof that screenshots reached the model. Link large material rather than pasting the whole project.

## 6. What Codex returns

One conclusion (`pass_for_scope`, `changes_required`, `blocked`) plus findings with severity, exact file/range, reproduction/evidence, affected requirement and suggested boundary to repair. Distinguish executed tests from inspection and unsupported environment. Preserve failures on the actual base; “pre-existing” needs a baseline reproduction, not a guess.

A fixed finding closes only after independent recheck. Any candidate change invalidates evidence for the affected scope; material changes require renewed whole-candidate review before release. Code approval is not a deploy receipt or product acceptance.

## 7. Hosted requests

Claude supplies a prepared exact batch; Codex independently reconciles live state and obtains/validates scope-bound owner authority. Bind commit/artifact, service IDs, database and migration hashes, config key names (not values), actual environment, model route, pilot data, maximum authorized spend/resource window, stop conditions and rollback.

Changing candidate, migration, target, resource/payer or effects increments request revision and requires matching renewed approval where material. Reusing an operation ID does not make provider effects idempotent. Record a durable operator journal before effects; a public claim is not an execution lock. A replacement operator reconciles prior effects before takeover.

## 8. Private/public split

Public: sanitized commit/file identities, findings, test counts and non-sensitive evidence refs. Private: credentials, database dumps, private project content, raw conversations, signed URLs, account/session details and deployed security reproduction details. Use only approved evidence storage. Never put secrets in an issue or fabricate access to a peer's local absolute path.

## 9. Context handoff

Before compaction or ending, use `templates/SESSION_HANDOFF.md`: current gate, exact source/base, changed files, tests, findings, approved decisions, pending operations/revisions, unknown effects, writer ownership and next permitted action. Resumption keeps identities, limits, source lineage and unresolved operations. It does not repeat completed deployments or reset a failed experiment.

## 10. Closure

Claude declares the implementation scope ready only from actual code/tests. Codex closes each operation only after effects, app verification and cleanup are verified or explicitly unresolved. Davide's acceptance is separately recorded. Both hand back a concise final status; neither quietly moves untested work to “done.”
