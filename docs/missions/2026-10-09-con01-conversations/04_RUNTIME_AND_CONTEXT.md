# Real Sophia replies, bounded context and useful projections

## Use the current native path

No new harness, root agent loop, Paperclip conversation issue, QM session store or Buzz relay is introduced. Use the current dsh registry, service-bound admission, native result observation, durable delivery and allowance machinery.

At G0, identify an appropriate existing role or add one minimal **read-only conversation specialization** within the same role family and registry, with a newly recorded composition when required. This is not permission to reuse a retired brief submission, mount all guide mutation tools, or change the default provider. Any new preset name in implementation is explicitly reviewed rather than advertised as already installed.

For the first mission, supply the bounded authorized context from the application. A responder does not need arbitrary host files, web browsing, external credentials or general domain writes merely to answer the three quick questions. It may receive only the narrowly needed read capabilities if the chosen native binding requires them. Framework-added tools must be inspected, not assumed absent.

## Input context contract

The trusted response binding contains the initiating subject, project and conversation IDs, human message/request IDs, current permission/control generation, cutoff of the local history, applicable project-context/eligibility revision, exact route/role configuration, and bounded allowance. Models cannot change these identifiers by including them in text.

Assemble:

1. The current request, preserving its full submitted meaning and separate attribution.
2. The relevant retained history of **this conversation**, or an eligible bounded summary with coverage plus recent messages. Context truncation is explicit.
3. The current mission context supplied by the existing compiler: accepted mission/constraints, proposed-but-undecided items and selected eligible sources.
4. Relevant exact output references where the application actually provides them.

Do not flatten all project conversations into one native history. Do not use a mutable global “current conversation.” Do not retrieve Personal content implicitly. Deliberate cross-conversation retrieval is a later capability; the first slice may explain that it is unavailable rather than making a false cross-thread claim.

## Concurrency and publication

One conversation response lane may serialize its inference while other conversations proceed within existing limits. Persist human messages independently of model availability. The native session/agent key and response publication target must include the conversation and applicable context generation, not the browser's selected tab.

For each accepted Ask request, keep an unambiguous terminal or pending outcome. Do not silently combine several asks and mark them all answered by one generic reply. The initial implementation should use separately correlated responses unless a formally reviewed batching contract explicitly preserves every covered request.

Before generation and before publication, recheck relevant authorization/eligibility. A normal new local message arriving after the answer's recorded cutoff does not needlessly erase the in-flight reply; mark what it answers. A privacy withdrawal or revoked authority can invalidate publication. A changed project decision invalidates cached current-state summaries; an in-flight answer cannot be displayed as an unqualified statement of a now-replaced decision. Use bounded revalidation/reassembly or an explicit superseded result, never an infinite refresh loop.

Publish an assistant message once from a trusted finalized native result, correlated to its response request. An incomplete token stream is provisional and must not become a complete historical answer by accident. A client/stream restart reads the durable state; it does not launch another inference. Budget-exhausted, failed, cancelled and unavailable states remain distinguishable. Retained useful partial output is labeled partial and cannot settle the request as a complete answer.

The simple implementation may display the existing answering indicator and publish final text when settled; token streaming is not a new requirement. Neither transport timing nor “later than my timestamp” proves that an incoming answer addressed this request.

## Quick asks: actual behavior

| Existing action | Required answer | Prohibited shortcut |
|---|---|---|
| Sum it up | What this conversation has discussed, attributed positions, relevant current accepted project constraints, and unresolved matters | Fixed fixture sentence, invented agreement, all-project transcript dump |
| What's still open? | Unanswered/uncertain matters in the observed conversation, with source references, separated from project proposals | Equate every question mark with a blocker; mark ambiguous matters settled |
| What did we decide? | Current accepted decisions from the mission record, with available time/provenance; explicitly distinguish conversation suggestions | Turn repeated messages or model opinion into a decision |
| Ordinary Ask | A useful bounded answer from available project context, or an honest lack-of-context/unsupported-action response | Claim to browse, create, schedule, approve or deploy without actual capability |

Quick asks are ordinary authenticated conversation messages with `askSophia=true`, not privileged commands. Conversation “Ask” remains separate from CTX-01's work-item reader.

## Summary and question projections

Stored messages and the mission ledger are authoritative. Summaries and inferred question lists are derived, regenerable and bounded.

Do not generate a paid summary just because someone lists or opens a conversation. The first implementation may update a persisted summary as part of an explicit “Sum it up” answer and update the recorded question projection during “What's still open?”. This requires only the corresponding approved inference, not a second background model loop. After new messages, mark coverage stale until updated. Future automatic refresh is not authorized by this mission.

Keep the extracted projected content structurally validated and linked to the observed message range and current source revisions. Invalid output produces no projection update; the last still-eligible projection remains with truthful coverage. Do not silently bless the free-form reply as an accepted decision.

Before a projection has been produced, `summary=null` is legitimate and recorded-open-question count may be zero, but the UI must state “Not assessed” or “No recorded questions yet,” not “Everything resolved.” A partial count needs a visible coverage qualification. Change the generated contract/UI together rather than pretending the old number conveys completeness.

Source correction/withdrawal invalidates the dependent summary, question list and assistant-derived excerpts. Suppress privacy-invalid bodies before an asynchronous rebuild. “Stale” is not an excuse to continue showing withdrawn content.

## Exact prompt delta to install through the scoped role

The following block is mission-authored role guidance. Preserve higher-priority Sophia identity and safety instructions; do not edit frozen assets to insert it. Record the installed bytes/version and effective tool list.

> You are Sophia responding inside the named team-project conversation supplied by the application. Treat the current request, earlier attributed messages, accepted project decisions and undecided proposals as different kinds of evidence. Use only the eligible context and read capabilities supplied for this request. Do not assume another conversation, private workspace, uncaptured meeting or unavailable source has been read. Cite supplied source/message/decision references where the output contract supports them; never invent a reference or a person's contribution. When summarizing, say what was discussed and what remains uncertain; agreement in chat is not an accepted project decision. When asked what was decided, use the current accepted mission records and distinguish them from suggestions. When asked what remains open, separate conversation questions from project proposals and actual blockers. Be useful and proportionate to the question; preserve the full meaning of a multi-part request. Do not create tasks, edit artifacts, accept decisions, approve permissions, schedule work, change execution resources or promise an unavailable action. Explain that limit when relevant. A submitted request is not completed work. Do not claim a tool or action occurred without the application's corresponding evidence. Do not move an answer to the currently selected browser tab: the application owns its destination. Retained text can be partial or outdated; respect the provided coverage and currentness information and state uncertainty rather than filling gaps.

This paragraph does not enforce authorization. The server, tool guards, output validator and tests do that. Role updates never grant broader runtime access.

## Recovery and spending

Use the existing reservation/settlement path compatible with the chosen route, and record how it is bound. Do not meter against a design or research allowance by accident. Initial provider-call limits, output/context limits and payer must be explicit in the release batch; do not invent prices or a new model here.

Human-only messages need no inference. For asked messages, a missing grant or unavailable runtime yields an honest blocked/not-admitted reply state while the human text remains governed as recorded. Explicit retry/continuation keeps the original logical request and cumulative allowance; uncertain generation is reconciled before another attempt.

Privacy erasure or explicit reply cancellation prevents a late result from publishing. No application-owned tool/result obligation may be orphaned merely by a deploy. Reuse current mechanisms; if this path reveals a required missing narrow recovery behavior, implement it inside this crossing rather than claiming REL-01 as globally complete.
