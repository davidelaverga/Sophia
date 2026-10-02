---
id: sophia-workspace-agents-deferred-direction
version: 1.0
created: 2026-09-30
status: user_decided_deferred_not_first_release
product: Sophia independent edition
implementation_authorized: false
deployment_authorized: false
provider_spending_authorized: false
automatic_monitoring_configured: false
review_policy: capability_and_customer_need_gated
---

# Sophia — Workspace Agents: deferred integration direction

## 0. Resume here

**Davide’s decision, 30 September 2026:** retain OpenAI Workspace Agents as a future optional resource for the independent Sophia product, especially for teams with eligible organizational ChatGPT plans. Exclude the integration from the first release. Preserve the investigation so the direction can be revisited without reconstructing the discussion.

The reasons are first-release focus, a higher qualification burden for organizational deployments, uncertain fine-grained spending control through the inspected interface, and an incomplete externally observable execution lifecycle. This decision supersedes the earlier recommendation to start a bounded integration experiment immediately. It does not reject the longer-term opportunity.

**Do not automatically reopen implementation after a version announcement.** Reassess when concrete control improvements and an actual customer need make the route appropriate. No future improvement, availability date, price, or savings percentage is assumed.

This is a decision and investigation ledger. It does not alter repository specifications, migrate existing work, enable credentials, purchase a plan, or authorize an experiment.

## 1. The opportunity being retained

People would continue to use Sophia Studio and the existing voice room. Sophia could delegate selected background research, analysis, or read-only review to a published Workspace Agent in a customer-authorized OpenAI workspace, then receive the result back into the project.

This direction is **Sophia → hosted organizational workflow**. It is distinct from publishing a Sophia plugin for people to use inside ChatGPT, controlling personal dots, or operating a separately billed managed-agent API.

The business hypothesis is that an established team could contribute a workflow and approved connections it already maintains, while Sophia supplies the guided mission, cooperation, review, and learning experience. That is an adoption hypothesis, not demonstrated customer demand.

## 2. Verified platform boundary as of this review

OpenAI’s availability announcement lists organizational/education plans rather than personal Free/Plus/Pro entitlement. Its trigger interface supports asynchronous submission, conversation keys, idempotency, and beta run polling, but not API retrieval of the answer. The inspected contract does not establish per-run cancellation, live steering, hard run budgets, or detailed usage retrieval. These are interface findings, not claims that every native/admin control is absent. [WA-01, WA-02]

Workspace Agents have native permissions, configuration, and connector controls. Business usage is token/credit based and shares applicable allowances with other agentic features. That does not make the integration unlimited or prove a fine-grained spending guarantee for Sophia. [WA-03, WA-04]

A personal account holder may also belong to an eligible organization; the distinction is the workspace entitlement, not the person’s identity. Business availability is not proof that a new third-party integration is production-qualified.

## 3. Responsibility boundaries to preserve

The working basis is Davide’s supplied **Sophia coordination architecture — source-grounded reassessment v2.0**, dated 29 September 2026. Its Paperclip/Omnigent/dsh composition remains a proposed direction, not a claim of completed integration.

| Responsibility | Retained owner |
|---|---|
| Human mission, accepted direction, membership, sharing, resource consent | Sophia and designated people |
| Assignment, dependencies, operational review and recovery for explicitly admitted work | Paperclip, when that route is implemented and selected |
| Execution within a hosted assignment | Workspace Agent under its provider and workspace controls |
| Native owner-local engineering resources | Existing planned narrow Omnigent route |
| Native reasoning and execution | Existing dsh route |
| Source eligibility, candidate admission, product acceptance, mission learning | Sophia |

There must be one operational continuation owner for each assignment. Paperclip and a provider-native routine must not independently start the same work. Existing attempts keep their current controller; this ledger authorizes no migration.

## 4. Candidate integration design, retained as a proposal

1. An authorized person admits a bounded work request against the current mission and source revision.
2. Sophia records its operational owner, expected output, permitted sources, enrolled workspace/agent, and resource grant.
3. The adapter records dispatch intent and submits the trigger using a stable request identity.
4. A role-scoped connection lets the agent retrieve only its permitted assignment and sources.
5. The agent returns a question, blocker, or candidate through an authenticated Sophia endpoint/tool.
6. Sophia verifies and preserves the candidate; a separate review decides whether it is usable or accepted.
7. Sophia explains the outcome and connects it to the mission through an observation or explicit proposed decision.

Proposed tool functions are assignment read, eligible source read, question/blocker reporting, and candidate submission. These are not existing registered contracts.

### Return path

A result-return channel would still need implementation and qualification. The preferred candidate is a narrowly scoped Sophia MCP service. Begin with structured text/Markdown, not a general binary export system.

Keep remote-run completion, candidate receipt, mechanical checks, and product acceptance separate. A completed run without a returned candidate is not a successful Sophia deliverable. A useful candidate followed by a provider failure remains a labelled candidate, not a hidden loss or automatic success.

### Credentials and identity

Outbound provider triggering and inbound access to Sophia are separate authorization relationships. Never infer the human actor from an arbitrary model-supplied identifier. Store credentials server-side and narrow them to enrolled destinations and operations.

A work ID is correlation, not authorization. Do not claim provider-attested execution identity from an ID merely repeated by a model. Exact identity guarantees must be documented at qualification.

### Stop, withdrawal and publication

Stopping new Sophia operations or rejecting a late candidate is not proof that remote computation or third-party effects have stopped. Until a verified control path exists, any admitted task must tolerate that distinction. Consequential actions should not be available through an independent route that evades the product’s authority boundary.

## 5. Why it is outside the first release

**Customer fit.** The first product must work for the selected personal-subscription/owner-resource audience without requiring organizational procurement or workspace administration.

**Financial control.** Request counts, concurrency limits and prompt instructions are not equivalent to a provider-enforced spending cap. Lack of observable cost or quota cannot be filled with a fictional remaining balance.

**Operational control.** Partial remote lifecycle visibility increases uncertainty around retries, duplicate effects, late output and suspension. First-release control semantics should not be weakened just to add another provider.

**Organizational readiness.** Customer data isolation, revocation, auditability, incident handling and connection administration require real evidence. The plan should not acquire a business/enterprise promise through a checkbox.

**Focus.** Complete the existing mission/creation/review loop before adding another hosting and support relationship.

These are prioritization reasons. They do not imply that consumer users deserve weaker privacy or safety.

## 6. Reopening conditions

Reopening is a decision, not an automatic consequence of passing a date or a release number.

| Gate | Required evidence |
|---|---|
| Customer need | A concrete eligible team wants a particular hosted workflow, and its value exceeds native-only/manual alternatives. |
| Entitlement and commercial use | Current terms and workspace administration permit the exact externally triggered integration. |
| Payer and limits | Effective payer, allowance consumption, overage behavior and controls are understood. Strict allowance-only mode requires enforceable evidence, not a prompt. |
| Lifecycle | Trigger identity, duplicate prevention, status, result return, timeout and suspension are verified on the actual route. |
| Cancellation/risk fit | A documented control path exists, or the narrowly selected task can safely tolerate explicitly limited cancellation. |
| Data governance | Customer-approved sources, purpose, retention/deletion, connector rights and project isolation are proven. |
| Result integrity | Actual result bytes/structured content and provenance arrive in Sophia, with acceptance separate from completion. |
| Operational ownership | One owner controls retries and reassignment; uncertain remote effects are reconciled rather than repeated. |
| Support and fallback | Missing results, revoked credentials and provider outages produce truthful recoverable states without unapproved paid fallback. |

A later developer API that exposes cancellation but still lacks suitable cost controls would not, by itself, close the financial gate.

## 7. First experiment, only after a new approval

One customer-approved workspace, one Sophia project, one read-only research or review assignment, and one returned text candidate. No production writes, purchases, unattended deployments or sensitive customer corpus in the initial experiment.

Prove correct identity and payer attribution, useful project outcome, duplicate suppression, result-return recovery, and handling of withdrawal before a late result. Observe real consumption and applicable admin controls. Do not manufacture an allowance exhaustion by wasting resources.

Any proposed experiment must receive a new scoped authorization. This ledger does not grant it.

## 8. Plan effect

- Preserve Sophia’s existing application, media, mission and dsh work.
- Preserve the v2.0 proposed Paperclip operational role and narrow Omnigent owner-local route.
- Keep S1-09’s three actual owner-resource acceptance obligations; Workspace Agents do not substitute for them.
- Add only this deferred extension record now. No new first-release dependency, mandatory abstraction or implementation package is required.
- Later, add a distinct capability-aware remote-workflow adapter rather than forcing hosted agents to claim native Hold/Stop parity.
- Retain Sophia-owned source, decision, candidate and learning contracts across editions.

## 9. Evidence and uncertainty

Current platform statements were checked against public official documentation on 30 September 2026. No paid run, customer credential, production deployment, or billing inspection occurred. The provided coordination v2.0 is the user’s planning basis; this review did not re-audit the entire Paperclip or Omnigent codebase.

No claim is made that OpenAI will provide the missing controls, that a future release will be generally available, or that integration will reduce costs. Monitoring is not configured by saving this file.

## 10. Source register

- **USER-01 — Decision:** Davide’s message in this conversation, 30 September 2026: defer Workspace Agents from v1, retain as a future business/enterprise resource option, and investigate Instinct separately.
- **USER-02 — Planning basis:** user-supplied “Sophia coordination architecture — source-grounded reassessment v2.0”, dated 29 September 2026. Provided directly in this conversation; not replaced by older Library documents.
- **WA-01 — Availability and native governance:** https://openai.com/index/introducing-workspace-agents-in-chatgpt/ — published 22 April 2026; accessed 30 September 2026. Historical launch copy is not a current commercial guarantee.
- **WA-02 — External trigger contract:** https://developers.openai.com/workspace-agents/trigger-runs — accessed 30 September 2026.
- **WA-03 — Configuration, roles and connector controls:** https://help.openai.com/en/articles/20001143 — accessed 30 September 2026.
- **WA-04 — Token/credit and Business allowance structure:** https://help.openai.com/en/articles/11481834-chatgpt-rate-card-business-enterpriseedu-credit-based-pricing — accessed 30 September 2026. Recheck at any future decision.

## 11. Decision log

| ID | Decision | Authority/status |
|---|---|---|
| WA-D01 | Exclude Workspace Agents integration from first release. | User-decided, current |
| WA-D02 | Preserve it as a future optional independent-Sophia organizational resource. | User-decided, current |
| WA-D03 | No adoption based merely on an expected next version. | Recommended review discipline |
| WA-D04 | Require actual spending, authority, result-return and recovery qualification. | Recommended reopening gates |
| WA-D05 | No repository changes, paid trials, monitoring or deployments authorized here. | Boundary of this task |
