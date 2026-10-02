# Working protocol — Claude implementation, Codex operations

## 1. One mission thread, exact records

One coordination issue per SCM mission records the current request, candidate, owner decisions, unresolved findings and next action. It links PRs and short evidence artifacts. Do not use disconnected chat summaries as the sole source of authority. A new agent session resumes the same mission and allowance; it does not start a new independent campaign.

Use identifiers such as `SCM-03-CC-0001` for an implementer handback, `SCM-03-OP-0001-r2` for a revised operation request, and `SCM-03-CX-0001` for an operator receipt. These are proposed identifiers, not existing issue comments. Actual issue/PR/run IDs are discovered or returned by tools, never guessed.

Every handback contains the same core: mission/goal, actor role, source candidate and base, request revision, observed state, action/test, evidence reference, unresolved limits and next actor/action. Keep long logs in bounded artifacts rather than pasting them repeatedly into model context.

## 2. Source and integration rules

Read actual repository instructions and the mission-specific sources first. Start from the accepted main/dependency tuple. The archived `sources/baseline.json` is orientation, not an instruction to ignore newer accepted work. Reconcile any moved baseline before changing generated contracts or runtime identities.

Never edit applied migrations, rewrite frozen pack history, assume old paths still exist, or force-push another contributor's branch. Nominate one writer for migration/amendment IDs, generated wire/types and runtime artifact identity at a time. PR29 remains its existing reconciliation lane; Part 2 consumes its result.

## 3. Operations request

Claude authors the required schema/config/source change and tests it locally. Codex verifies actual target state read-only and compares it with the request. The owner approves a concrete batch, including any bounded real provider test. The operator then executes only the approved steps, verifies each and records receipts.

A valid request names exact source, artifact identities, target project/services, intended effect, migration names/hashes/order, required environment **names**, retained allowance, expiry, preconditions, compatible recovery and success/failure probes. No secret value belongs in the issue, generated pack or handback. Null fields in the included JSON template mean not authorized/not yet bound.

An approval of a plan is not approval of deployment. A risk acknowledgement is not approval to exceed the resource owner's hard limits. A general “do everything needed” must be narrowed to concrete external effects before execution, while routine in-scope steps need not ask repeatedly.

## 4. How to avoid permission bureaucracy

Discover resolvable information before asking the owner. Bundle related effects under one exact candidate and bounded authorization. Use the same approval while the source/target/effects remain within that envelope. A new unrelated service, schema scope, payer, destructive action or materially different candidate needs an amended request.

An unavailable external tool or forbidden operation produces one bounded handover to the actor who can perform it. It does not justify implementing an insecure alternative, silently using another person's token or leaving an autonomous agent running indefinitely.

## 5. Verification ladder

| Evidence | What it supports |
|---|---|
| Source inspection | The code/contract exists at a pinned revision |
| Unit/fixture test | Behavior under its labeled synthetic inputs |
| Integration test | The named actual components work together in that environment |
| Native/provider probe | The selected installed runtime/account/model behaves as observed |
| Hosted receipt | The exact service/artifact/schema effect was applied and verified |
| Product episode | Davide/Luis accept the intended experience with recorded limitations |

Each required case records candidate SHA, configuration identity, environment, evidence origin, result and limitations. No model-generated “done” upgrades the ladder. A `/ready` response or green CI does not prove the real provider episode.

## 6. Bounded sessions and defects

Goal sessions end when their deliverable is verified or a specific blocker is handed off. Use fake clocks for time semantics; do not wait hours/days to create the appearance of reliability. A serious control/privacy defect is not waived to maintain a PR count or delivery date.

After a defect, preserve the failed attempt and update the same work's remaining allowance. Diagnose whether it is transport, native lifecycle, content quality, source eligibility or a plan mistake. Repair the smallest affected layer; rerun the tests that actually exercise it.

## 7. Final handback

Use `HANDOFF_TEMPLATE.md`. Record source-ready, merge-ready, release-ready, hosted-verified and product-accepted separately. These states fit in one message; they do not require five approvals or five agents. Return a concrete next action rather than “continue testing” without an owner or stop condition.
