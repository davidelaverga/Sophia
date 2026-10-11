# Mission and product boundary

## Outcome

Complete the existing multi-conversation Studio experience against durable authorized records and the selected native dsh runtime. People can **create, write, ask, leave, reopen, and continue** without losing authorship or confusing conversation history with accepted project decisions.

This operationalizes v3 CON-01. Detailed behavior below is a proposed implementation contract where the existing UI proposal does not define backend behavior. G0 records the accepted contract and current source bindings; a source contradiction is resolved explicitly, never silently imported from old plans.

## The user episode

Use a dedicated test project and authorized test members, not a real team's unconsented history.

Davide opens **“Onboarding direction”** and posts an idea with Ask Sophia off. Luis contributes in that conversation. Davide opens **“Presentation narrative”**, posts a different idea, and asks Sophia for help. Both conversations show the same currently accepted project constraint, but the second does not receive the first's whole transcript or its unrelated detail.

Davide returns to Onboarding and uses **“Sum it up,” “What's still open?” and “What did we decide?”** Sophia answers from actual retained conversation records plus the current eligible mission context. She distinguishes a suggestion from an accepted decision. Luis makes an authorized decision using the existing proposal/decision UI; future context reflects that decision in both conversations without rewriting earlier messages.

While Sophia is replying, Davide changes conversations and types a draft. The reply goes to the original conversation and the draft survives. A lost Send response is retried as the same intent; one human message and at most one eligible response request result. After a real process/client restart and return, the records remain coherent. Withdrawing a message removes its body from eligible reads and invalidates dependent summaries and runtime context. No old voice content is reconstructed.

## Required scope

| Area | Required result |
|---|---|
| Durable text | Atomic conversation + first message, subsequent messages, authenticated authorship, conversation-local ordering and bounded pagination |
| Participation | Members write; current authorized viewers read; unknown membership grants neither; guests/outsiders remain excluded |
| Ask Sophia | `askSophia=false` persists text only; `true` durably requests a scoped native reply, shown separately from receipt of the message |
| Context | Same current mission/accepted decisions/eligible sources, separate local histories; no default cross-conversation transcript loading |
| Return | Existing list, thread, context, draft and delayed-write behavior backed by real records and refresh/replay |
| Projection | Bounded summary and recorded open-question information with explicit coverage/currentness; no invented “fully summarized” state |
| Decisions | Preserve existing A08 proposal/decision path; conversation prose or a generated summary never accepts a decision |
| Output | Correctly render an existing eligible exact artifact/version reference when present; keep null when there is no output |
| Privacy | Explicit saved-text policy, withdrawal/erasure, derived-content invalidation and current-membership enforcement |
| Delivery | Local proof, independent review, authorized release and actual browser/provider episode |

## Explicit non-goals

Do not implement CTX-01's task-panel explanation, CON-02 meeting close/catch-up/search, new image/deck/frontend generation, owner-native engineer enrollment, resource quotas, a Paperclip upgrade, QM/Buzz adoption, Slack, routine automation, model/provider switching, general cross-conversation search, or ambient audio/transcript capture.

Do not require renaming, archiving, unread receipts, typing indicators, attachments, arbitrary chat editing, a new notification system or a universal retention product. The minimal erasure/withdrawal control required by the saved-text policy is a privacy obligation, not a general chat-management expansion.

Do not turn ordinary chat into an operational issue or add a second scheduler. No infinite inference on every project update, list read, tab switch or new human-only message.

## Selected mission decisions

**D1 — Preserve the interface.** Complete Luis's three-pane desktop and single-screen mobile flow. Restrict UI changes to real binding, coverage/retention/error information and necessary accessibility.

**D2 — Explicit invocation.** The existing Ask Sophia selection is the invocation signal. The three conversation quick asks use the same real request path. No attention-classifier project is needed.

**D3 — Read-only responder for this slice.** A conversation answer may reason about supplied eligible project material but cannot create work, change a source, approve a proposal, use an external account or control another attempt. Existing explicit UI controls continue through their existing authorized operations. A request for new unsupported execution gets an honest limitation, not a promise to run it.

**D4 — No arbitrary new provider.** Reuse a currently authorized compatible route, subject to recorded payer/allowance and native readiness. Do not assume the research or design grant authorizes conversation inference. No credentials or provider selection is made by this document.

**D5 — Independent progress.** Implement storage/context/UI work without waiting for a new external engineer, browser provider or design format. Native activation may need a coordinated bundle change; that boundary must be scheduled, not used to block all other source work.

**D6 — Full mission means real behavior.** A table, fixture conversation, HTTP 200, loaded bundle or model final sentence cannot close this mission. Source-ready and locally verified remain separate from app-verified and owner-accepted.

## Success and stop condition

CON-01 is complete when all mandatory acceptance cases have the required evidence, the first real episode passes on the reviewed candidate, the read/write/reply privacy paths remain available under the agreed release policy, and Davide accepts the outcome. If live credentials or a release target are unavailable, finish permitted source and independent checks, deliver a release-ready handoff, and leave live/app acceptance explicitly open.
