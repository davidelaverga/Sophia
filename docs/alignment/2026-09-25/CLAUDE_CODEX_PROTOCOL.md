# Claude ↔ Codex development handoff protocol

**Version:** 1.0 · **Scope:** development of S1-05A in `https://github.com/davidelaverga/Sophia`. **Not:** the future Sophia agent-to-agent platform.

## 1. Purpose and role boundary

Claude Code owns implementation, local tests, candidate source, requested operational steps and interpretation of returned evidence. Codex owns only the explicitly authorized hosted inspection/execution assigned to it. Luis owns the agreed integration/merge review. Davide supplies product and operational authority within his own accounts.

The user has said Claude currently lacks production-deploy and hosted-schema permissions. Preserve that separation. Do not give Claude Codex's credentials, make Claude spawn a higher-privilege child to defeat a denial, or represent the handoff itself as a grant.

An authorized independent operator can perform an approved task that the implementer's environment cannot. A task prohibited by a higher-priority rule stays prohibited through every route.

## 2. Transport: one explicit GitHub coordination thread

Use a single owner-created or owner-approved **coordination issue** in this repository for this goal, with links to its implementation/release PRs. Record the actual issue number once it exists. It is currently **not created**; this packet invents no live issue or session ID.

Both agents use their own existing authorized GitHub connection to read/post there. The public repository means the thread is public: post sanitized metadata, commit IDs, checksums, decisions and evidence references only. Sensitive host values, participant data and private evidence stay in the owner's existing private store. Do not put signed invite links, bearer tokens, passwords, `.env` contents, raw database output or raw conversation in comments.

No shared filesystem is assumed. The old attachment's Sophia-Agent path is not reused. Repository source travels by exact commit, not by an absolute path on the other computer.

Before coordination starts, record:

- goal ID, coordination issue URL, implementation PR and candidate branch;
- authorized human owners and each agent's actual native session identifier (private reference when necessary);
- each agent's writable code scope;
- permitted read-only inspections and any separately granted effect envelope;
- the operator's actual target-environment mapping, retained privately where appropriate.

This metadata is a coordination agreement, not an ACL-enforcement service.

## 3. Wake-up behavior and economy

An immutable GitHub comment is a durable message; it does not automatically wake an idle Claude or Codex session.

Start both sessions explicitly. While an agent is already doing useful work, it checks the thread at meaningful boundaries and at most every two to five minutes when a response matters. It does not run an empty model loop or flood the thread with acknowledgements. A native supported event hook may be added later; it is not assumed installed by this protocol.

When the recipient is idle, Davide gives one short trigger: “Read coordination message `<id>` in `<issue>` and follow your existing role.” The full instruction remains in the message. No desktop screenshots, clicking other agents' chats, or remote input injection is required.

A waiting implementer continues independent permitted work. An operator with no approved request returns idle. Do not claim unattended end-to-end operation when manual wake-up is still required.

## 4. Message identity, ordering and state

Each author appends immutable messages. Corrections are new messages with `supersedes`; do not rewrite operational history after execution. The actual GitHub author and approved session mapping determine provenance, not a self-declared `from` field alone.

Required fields:

```yaml
protocol: sophia.dev-handoff.v1
message_id: S1-05A-CC-0001
from_role: implementer
reply_to: null
kind: inspect_request
operation_id: S1-05A-OP-0001
candidate_commit: null
summary: Inspect the current deployment and migration baseline; no changes.
```

Message kinds: `inspect_request`, `execution_request`, `review_finding`, `clarification`, `claimed`, `prepared`, `execution_started`, `result`, `blocked`, `cancel_requested`, `reconciled`.

One `operation_id` represents one intended effect set. Retrying delivery preserves that ID. Changing candidate source, target, schema list, scope, spending or rollback requires a new version/request and renewed approval where the prior grant no longer matches.

The operator records a local durable operation journal, outside Git, before executing. One Codex operator owns effects for this goal. Two sessions must not both claim the same operation. The GitHub claim comment is visibility; the operator journal and actual provider state are the reconciliation basis, not a distributed lock guaranteed by comments.

Distinguish **received**, **prepared**, **authorized**, **started**, **effect observed**, **verified**, **failed**, **outcome unknown**. Received/claimed never means approved or completed.

## 5. Read-only preflight request

The first request asks Codex to resolve facts, not deploy anything:

- current Render service and branch/auto-deploy setting;
- exact API and Studio deployment IDs, commits, health/readiness meanings;
- current hosted migration ledger and checksums for 0001 onward;
- expected application/migration roles and TLS/session-pooler configuration;
- presence of required environment settings, returning boolean/status only;
- actual LiveKit configuration availability;
- owner-controlled Auth settings relevant to founder invitations and guests.

The inspected public report names `sophia-next` and an old `deploy/render-vercel` auto-deploy branch. Confirm identities against the authorized account; never select a similarly named service blindly.

A hosted live-auth test creates/deletes synthetic records and is **not** a read-only inspection. Migration application, environment edits, API key creation, Auth changes, new services, plan upgrades and deploys require explicit execution requests.

## 6. Execution request contract

A request must contain all of the following before an effect is eligible:

```yaml
protocol: sophia.dev-handoff.v1
message_id: S1-05A-CC-0007
kind: execution_request
operation_id: S1-05A-OP-0002
candidate_commit: "<exact reviewed 40-character SHA>"
implementation_pr: "<actual PR>"
approval_ref: null                 # requesting execution is not approving it
scope:
  environment_ref: "<owner-confirmed target reference>"
  effects:
    - "<exact bounded migration/config/deploy step>"
preconditions:
  deployed_commit: "<observed or explicitly reconciled>"
  schema_digest: "<observed>"
  tests_ref: "<actual result>"
inputs:
  migration_files: []
  migration_sha256: {}
  release_manifest_ref: "<reviewed artifact/commit path>"
verification:
  expected_schema: "<expected ledger after operation>"
  expected_deployments: []
  smoke_checks: []
recovery:
  compatible_code_rollback: "<known compatible candidate or explicit unavailable>"
  schema_reversal: "not authorized"
limits:
  expires_at: "<owner-approved time>"
  spend_ceiling: "<explicit owner allowance or no new spending>"
```

The real request must replace placeholders with verified values. It contains the actual command list and expected outputs or a reviewed runbook bound to the same commit. Do not execute placeholder commands or a free-form “deploy the latest” request.

Codex rechecks owner approval, current environment, source/digest, applicable denial rules and the exact effect set. Approval can cover a bounded batch so the owner is not asked about every harmless subcommand; it cannot silently extend to a different database, public signup, destructive migration or bill.

## 7. Execution and failure protocol

1. Validate the candidate in an isolated checkout. Review migration/config diffs and the tests; do not run a shell block merely because a peer posted it.
2. Publish `prepared` with preflight results and any changed conditions. Wait for matching authority when absent.
3. Acquire the goal's sole operator role and record `execution_started` before effects. Check revocation/cancellation immediately before each independently consequential step.
4. Use existing documented operations. For hosted migrations: dry-run the existing migration runner, compare its pending files/checksums, then apply only the approved missing append-only migrations. Do not reapply 0009–0011 just because the report mentioned them.
5. Never push the local Supabase config to hosted. Change only the approved hosted properties; keep migration owner and restricted API login separate. Preserve verify-full TLS and the session-mode pooler required by LISTEN/advisory locking.
6. Deploy the exact reviewed source/artifact. Recheck that an older auto-deploy branch cannot race the operation. Record actual deployment IDs and source commits, not only an HTTP 200.
7. If delivery or deployment outcome becomes unknown, inspect the migration ledger/provider deployment history and reconcile. Do not reissue an uncertain billed or effectful operation as a new operation ID.
8. A cancellation request stops further authorized steps but cannot undo a completed migration or deployment. Report partial effects and the safe next action. No automatic destructive down-migration.
9. Return a compact result; Claude verifies it against the request and does independent read-only checks where permitted. A Codex “done” sentence is not sufficient evidence.

## 8. Result and handback

Normally keep the handback under 80 lines. Large logs remain in the authorized evidence store.

```yaml
protocol: sophia.dev-handoff.v1
message_id: S1-05A-CX-0008
reply_to: S1-05A-CC-0007
kind: result
operation_id: S1-05A-OP-0002
state: verified                 # or failed / outcome_unknown / blocked
executed_commit: "<actual SHA>"
authority_ref: "<actual bounded approval>"
steps:
  - action: "<performed action>"
    outcome: "<observed result>"
    evidence_ref: "<sanitized reference>"
schema_before: "<digest>"
schema_after: "<digest>"
deployments: []                 # actual IDs, service/source associations
smoke_results: []
unresolved: []
next_action: "<one concrete next step>"
```

Keep secret existence/status separate from secret values. Retain no raw transcript or invite token in a public test artifact. Claude updates the implementation ledger from the actual evidence and leaves any unverified item unverified.

## 9. What is deliberately not built

No general A2A product, agent credential pool, unattended desktop automation, new supervisor loop, repeated paid polling, or bypass of native approval prompts. A reliable human-initialized pair with compact durable messages is sufficient for this development task.

When Sophia's own S1-09/S1-10 integrations exist, migrate the message/operation semantics—not assumptions that GitHub comments provided exactly-once execution or automatic waking.
