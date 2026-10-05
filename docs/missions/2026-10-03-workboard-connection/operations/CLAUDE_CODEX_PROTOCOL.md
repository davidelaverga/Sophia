# Working protocol — implementation, review and authorized operations

## Roles and medium

Luis owns WBC-01 and the Studio integration seam. Claude Code implements the assigned branch; Davide is the product/backend decision owner. Codex independently reviews and operates where explicitly authorized. Use separate worktrees so implementation files cannot change underneath an operational check.

Use **one GitHub coordination issue linked to each mission PR**, or the already-active matching issue when the owner has designated it. Do not repurpose M03/#31 without its owner's agreement. Record the actual issue number at mission launch; do not invent one in this packet. Ordinary issue comments do not automatically wake idle sessions. While active, check the issue at meaningful boundaries; the human may wake an idle session by referring to the exact message ID.

Public issue content is sanitized metadata only. No credentials, .env contents, active invitation links, private transcripts or customer source bodies. Use secret-store/reference IDs for sensitive evidence.

## Message envelope

```text
WBC-MSG <mission>-<author>-<sequence>
kind: HANDOFF | CONTRACT_PROPOSAL | REVIEW_REQUEST | FINDING | OPS_REQUEST | OPS_RESULT | BLOCKED
reply_to: <message ID or none>
mission: WBC-01 or WBC-02
branch: <actual branch>
commit: <full SHA>
scope: <owned paths and intended behavior>
request: <one bounded action>
evidence: <sanitized references>
next_owner: <named person/session>
```

Do not acknowledge acknowledgements. Answer a meaningful request, finding, changed state or exact operator dependency. A message is communication, not an expansion of authority.

## WBC-01

No production effect is required. Codex can review the actual diff and run tests independently. A fixture-only merge is not live capability acceptance. A source fix does not need a provider probe to prove a purely local reducer rule.

## WBC-02 operator sequence

1. Read-only inventory: actual deployments, source/configuration identities, database migration ledger, existing allowance/secret references and open writer reservations. Do not deploy current main merely because it exists.
2. Claude produces tested code and a bound operation request.
3. Davide authorizes the particular effect batch. No approval means continue nonblocked local work, not find a different path around permissions.
4. Codex verifies current state and executes the approved exact operations. Report actual receipts or uncertainty.
5. Claude consumes the results and reconciles code/evidence. A changed source SHA, migration checksum or target requires an updated request/approval.

## OPS_REQUEST requirements

Include exact source SHA and artifact digest; target service/database/project; operation and sequence; migration filenames/checksums/dependencies; observed preconditions; secret references only; intended network and payer; current authorized limits/expiry; expected effects; verification commands/results to collect; recovery path; owner approval reference.

For Paperclip provisioning, report the expected ongoing infrastructure cost **before** authorization. For a real provider review, name the actual route and maximum allowed spend/requests. Model subscriptions used for coding do not fund Sophia's API inference automatically.

## OPS_RESULT requirements

Record started/completed/failed/unknown; provider deployment ID or migration receipt; observed commit/configuration; read-only validation; remaining allowance; deviations; recovery performed; next owner. A timeout after an operation may have succeeded is unknown, not safe to retry. Inspect the provider/migration history and stable operation key before repeating an effect.

## Scope and file collisions

One writer owns shared contract amendments/migrations/runtime identities per merge window. WBC-01 owns feature-local UI and proposed fixture types; WBC-02 owns activation/persistence and the agreed minimal Studio binding. M03 retains its active source/report/registry history until explicitly handed off. Changes to the protected guide/system prompt are excluded from these missions except WBC-02's separate bounded reviewer asset.
