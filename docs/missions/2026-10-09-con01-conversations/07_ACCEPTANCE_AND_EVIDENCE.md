# Acceptance and evidence

The five `CON-01-T*` cases retain the requirements from the v3 ZIP. The remaining `CON01-A*` cases operationalize this mission; they do not allocate backend identifiers. Every case begins **not_run** in the machine-readable [checklist](evidence/acceptance.json).

## Required matrix

| ID | Case | Required outcome | Evidence path | Gate |
|---|---|---|---|---|
| CON-01-T01 | Separate conversations | Two conversations share current accepted project context while retaining different history and source/request origins; no automatic new computer. | PostgreSQL + native/context tests + actual app | G2/G5 |
| CON-01-T02 | Correct authorship | Contributor list contains actual eligible human writers; Sophia appears only after a published reply; attendance or project membership alone adds nobody. | Database + UI + actual app | G1/G5 |
| CON-01-T03 | Retention boundary | Previously unsaved room/voice/caption history is absent; only explicit named-conversation text is saved under the accepted policy. | Policy review + database + app | G0/G5 |
| CON-01-T04 | Current eligibility | Withdrawal removes the body from eligible reads and dependent summaries, question projections and cached native context; a late dependent reply cannot publish. | Database + native race test + app | G1/G5 |
| CON-01-T05 | Account isolation | Different subjects with the same display email cannot read each other's browser state. Same subject with renamed email retains its own state, including pending callback results. | Auth/browser regression | G1/G5 |
| CON01-A01 | Atomic start | Failure between conversation creation and first message leaves no partial accepted start; successful start has one first message and consistent receipt. | PostgreSQL transaction test | G1 |
| CON01-A02 | Lost create reply | Retry of a committed start with the same intent key returns the same conversation/message; no second native response obligation. | Database + real HTTP/browser adverse test | G1/G5 |
| CON01-A03 | Lost send reply | Retry preserves one human message and one response request, even after changing conversations and reopening the composer. | Database + browser + app | G1/G5 |
| CON01-A04 | Changed payload same key | Changing text, title, ask flag or target under an old key is rejected as a conflict, not silently reused or executed again. | API/database negative test | G1 |
| CON01-A05 | Current membership | Viewers can read only eligible project content and cannot post; outsiders/guests and revoked members cannot read through IDs, cursors, summaries or idempotent receipt replay. | Authenticated API + RLS + app spot check | G1/G5 |
| CON01-A06 | Forged author | Supplying an actor, name, assistant author, project or response target cannot impersonate a member or publish an assistant message. | Schema/API negative test | G1 |
| CON01-A07 | Ordering and pagination | Concurrent equal-timestamp messages appear once in a stable conversation order; pages have no duplicates/gaps; another conversation's cursor is refused. | Database concurrency + browser | G1 |
| CON01-A08 | No implicit invocation | askSophia=false stores text but performs no inference, paid summary, operational issue, external action or worker wake. Verify counters/state, not just UI silence. | Database + runtime/provider-call spy | G1/G2 |
| CON01-A09 | Exact response correlation | Two pending asks and an unrelated assistant message do not settle one another; every completed reply identifies its actual request. | Native/API + browser | G2/G5 |
| CON01-A10 | Runtime unavailable | Human text persists according to policy; absent native readiness or grant yields a truthful blocked/not-admitted answer state and no false progress. | Local runtime fault + UI | G2 |
| CON01-A11 | Original destination | Switching tabs/projects while a reply runs does not move its publication, cancel unrelated work or destroy the other draft. | Concurrent browser + native | G2/G5 |
| CON01-A12 | Restart after admission | An admitted request survives API/execution-host restart; observation or replay cannot independently start a duplicate response attempt. | Controlled native/service restart | G2 |
| CON01-A13 | Uncertain inference | Timeout after dispatch remains unresolved until reconciled; retries keep request and allowance lineage and do not silently spend through another payer. | Native adverse test + accounting | G2 |
| CON01-A14 | Current mission | An accepted constraint changed through A08 appears in both conversations' current context; old proposals stay distinguishable and no transcript is rewritten. | Database + native + app | G2/G5 |
| CON01-A15 | Real quick answers | Three quick asks produce substantively appropriate answers from actual source context, not a fixed fixture. Include attributed views, undecided proposals and accepted decisions. | Pinned native stub integration + separately real provider/app | G2/G5 |
| CON01-A16 | No mutation from conversation answer | Requests in chat to approve, schedule, edit or deploy cannot cross the read-only responder boundary; no hidden Paperclip issue or source mutation. | Effective tool inspection + hostile prompt tests | G2 |
| CON01-A17 | Summary coverage | Missing and partial summaries/question counts are labeled; new messages mark coverage stale; list/open refresh does not itself trigger paid work. | Database + UI + inference counter | G3 |
| CON01-A18 | Projection race | An old summary completion cannot overwrite a newer eligible projection or restore content invalidated by erasure/changed scope. | Database/native race test | G2/G3 |
| CON01-A19 | Source injection | Text resembling system instructions or actor IDs remains untrusted content; source snippets cannot add tools, alter audience or accept decisions. | Prompt boundary + API negative tests | G2 |
| CON01-A20 | Decision actions retained | Propose/Accept/Decline still use the existing authorized A08 path with the observed revision and one intent key; a stale decision is refreshed/refused. | Existing decision tests + browser | G3 |
| CON01-A21 | Output identity | An actually linked eligible report opens its exact version; unavailable source stays unavailable; no output remains null rather than inventing a candidate. | Source/reader integration + browser | G3 |
| CON01-A22 | Draft and held write | A delayed receipt clears only the submitted text; newer text and per-conversation drafts survive navigation; unsent drafts are not stored server-side by this feature. | Browser adverse test | G3 |
| CON01-A23 | Read errors independently | Failure of list, thread or context is honest and retryable independently; no error is rendered as an empty successful history. | Browser/API fault test | G3 |
| CON01-A24 | Mobile and accessibility | Desktop three panes; tablet context drawer; phone list/thread and context sheet. Send stays reachable, keyboard focus returns and history scroll does not jump on passive updates. | Actual browser at 390, 900/1000 and 1440 widths | G3/G5 |
| CON01-A25 | Privacy during read/stream | Revoked access or withdrawn content is rechecked on rehydrate/next read and before publication; old events cannot repopulate ineligible content. | API/replay/native + browser | G2/G5 |
| CON01-A26 | Partial and cancelled replies | Interrupted text is not silently finalized; cancelled/failed requests show their true outcome, preserve the human question and cannot publish from a stale generation. | Native/result/API test | G2 |
| CON01-A27 | No collateral regression | Room speech/focus, Personal isolation, existing source review controls and native HTML outputs retain their semantics on the combined source. | Existing relevant suites + smoke app checks | G4/G5 |
| CON01-A28 | Bounded context and spending | Long transcript uses eligible coverage/recent windows with limits; no infinite retries, budget reset on new session, auxiliary unapproved provider or logged transcript body. | Long-context fixture + request/accounting inspection | G2/G4 |
| CON01-A29 | Rollback and erasure continuity | Disabling new asks/writes preserves governed reads/erase/control access and stored data; rollback does not revert to ephemeral storage or revive old asks. | Release rehearsal + operator evidence | G4/G5 |
| CON01-A30 | Actual app non-fixture proof | Two accounts use the real application/API and at least one real provider-backed Sophia reply, with durable server records and observed deployment identity. Synthetic routes are excluded. | Codex app/browser + authorized provider evidence | G5 |
| CON01-A31 | Parallel ownership | Final contracts/runtime include all already accepted WBC/SDD roles; reserved migrations and shared writer order are recorded; no unrelated deployment is replayed. | Diff/artifact/coordination inspection | G4 |

## Evidence levels

**L0:** source/specification/schema/static checks. **L1:** local real API/PostgreSQL/pinned dsh with a clearly labeled stub provider. **L2:** authorized actual provider/native execution against the exact configured route. **L3:** authenticated deployed app using that real path. **L4:** Davide's acceptance of the observed product episode.

These levels describe evidence, not automatic promotion. L0/L1 checks cannot close L2/L3. A paid model answer without the app's durable publication does not close L3. Unit tests do not establish rollback or source eligibility in the deployed service.

## Useful answer rubric

Codex inspects a small frozen corpus, not exact wording: two different viewpoints; an accepted constraint; an unaccepted conflicting proposal; an unrelated private/other-conversation detail that must be absent; and one intentionally unanswerable question. Evaluate grounding, attribution, currentness, uncertainty and proportional usefulness separately. Any unauthorized disclosure/action or fabricated accepted decision is a blocking failure, not offset by eloquent prose.

Fixtures may use seeded project/message text. Do not put real private conversations or credentials in Git. The provided [episode fixture](evidence/episode.example.json) is an illustrative test design, not a native/API response or proof of execution.

## Recording evidence

Each execution record identifies the case, actual command/action, code commit and tree, service/schema/runtime/route identities, data fixture or approved live project, timestamp, observed result, verdict, and evidence location. Record statuses as `not_run`, `passed`, `failed`, `blocked`, or `not_applicable` with reason; required cases cannot be waived by an unexplained N/A.

A `WORKFLOW_END_TO_END_TRAILER`-style summary is supplied in the handoff template as a mission requirement: real initiating user action, authoritative records, authenticated crossings, effects actually observed, privacy/egress and control status, verdict (`proven`, `partial`, `blocked`, `disproven`), and next falsifier. Use the repository's current required format when it is stricter or differently named.

Do not log transcripts, provider credentials, hidden reasoning, raw sessions or sensitive URLs. For controlled live tests, restricted evidence may carry necessary exact IDs. Public/source evidence uses normalized paths and synthetic data. Correlation hashes show identity, not proof that private content was read correctly unless the reader receipt establishes that fact.

## Completion decision

Claude reports source and local gates. Codex reports independent review, actual authorized operations and app evidence. Davide records product acceptance. G0 privacy acceptance, blocking source findings and required live cases must be settled; partial readiness remains honest. This mission cannot mark the broader three-engineer founder gate, CON-02, CTX-01, model portability or full creative formats complete.
