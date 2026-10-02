# Owner-native resources, permissions and telemetry

## 1. Retain the selected native connection path

Use the existing architecture 11 transport spec [S08] as the initial conformance target, pinned to `7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. This pack refreshed the device-auth source at `112f3085446323e035423c83747a9734a3c272da`; it did not requalify every newer native operation. **Do not silently upgrade the selected transport to HEAD.** SCM-02 may propose one exact replacement only if a concrete defect/need is demonstrated and the complete affected matrix is rebound.

Three enrollment records: `davide-codex`, `davide-claude`, `luis-claude`. They are owner-authorized execution routes, not seats in a shared provider credential pool. Existing native provider login remains on the owner's host. Ordinary project collaboration does not confer provider-account access.

## 2. Owner onboarding

Use invitation-only Omnigent accounts mode, non-admin engineer accounts and a distinct operator. A backend-controlled device grant gives delegated Omnigent access after owner consent. The initiating Sophia account, returned Omnigent owner and selected host/repository are bound in a verified enrollment. Store rotating token material encrypted outside project documents, logs and browser state. The sessions scope is a path allowlist, not upstream-enforced project scoping. [S08/O01]

The contribution grant records allowed projects/repository roots/worktrees, operations, supported models, concurrency, availability window, allowance/reserve, telemetry visibility and whether handover/reallocation is preauthorized. Expiry and revocation are real checks. A peer may steer admitted project work within this grant; it may not authorize a new host root or another person's permission request.

Start with one-time founder setup and a concrete connection test. Do not build generic enterprise SSO, billing or a catalog of every native coding product.

## 3. Launch ordering retained from architecture 11

Create the dormant session with multipart `metadata` and trusted `bundle`; record returned `session_id`; inspect the bound session; install assignment-scoped HTTPS MCP; set the native model/effort before launch; launch on the selected owner host and explicit worktree/base; observe actual readiness; then send the identified assignment.

Do not confuse multipart response `{session_id}` with the other creation route's `{id}`. Do not pass a model alias in an unsupported metadata field. A launching response is not proof of authenticated execution. A repo branch name must resolve to the expected source commit before the worker writes. Tools and author instructions for Claude are installed at launch, not conjured by a later per-turn tool array. [S08]

The app-facing adapter accepts only constructed operations. No generic upstream proxy, arbitrary native command, screen clicking or access to an unenrolled desktop conversation. An existing Omnigent-backed session can be adopted only after owner verification and scope inspection; an arbitrary external chat is a context handoff, not an adopted process.

## 4. Permission lifecycle

A `RequiredAction` names project, work, attempt, actual native session/child, request ID/fingerprint, owner, requested operation, deadline, current state and safe native-open target. Required owners receive the action; other collaborators see only permitted status.

Phase one: **Open native request** and reconcile the response in the native tool. Display resolved only on native evidence; display resumed only when execution actually continues. If an action has no safe deep link, name the tool/session accurately rather than manufacture a URL.

Phase two inside SCM-06: enable a supported in-app accept/decline/cancel path only after testing the exact endpoint/request schema under the owner's current identity, fingerprint and grant. Browser/login/OS prompts that are not exposed remain native. Never default to auto-approve or skip-permissions to make the integration look seamless. Model-proposed answers do not establish owner approval.

Stop/revoke always bypasses permission-wait and quota-warning ceremony. A stale or already answered permission returns a reconciled state, not a second side effect. A failed response leaves `outcome_unknown` and is inspected before another answer.

## 5. Capacity telemetry in the first engineer release

Collect only supported structured output through the enrolled owner host. Codex app-server account limit read/update and Claude Code status-line JSON are candidate channels documented in W01/W02; verify exact installed version, account mode and headless behavior. Telemetry adapters must not extract provider OAuth tokens to call undocumented endpoints. No paid “hello” solely to populate a quota meter.

The collector returns owner/opaque entitlement ID, native runtime version, source channel, observed time, window IDs, optional utilization/reset, applicability and missing-field information. An unsupported channel returns a truthful unavailable capability. It does not block useful owner-authorized bounded work by itself, but it prohibits claims of spare capacity and automatic optimization that assumes it.

Keep account-wide, model-scoped, short, weekly and spend windows distinct. A context-window percentage is not subscription quota. A reset time in the past is refresh pending, not fresh capacity. Two sessions on one account are consumers of one entitlement; two owners of the same provider are not merged.

The initial UI shows owner, native tool, current work, limiting known window, next known reset and observation age. The expanded view distinguishes observed values, owner reserves and estimates. Private task titles, history, billing identity and credentials never accompany shared telemetry.

## 6. Accounting limits

Source inspection does not establish the commercial entitlement for every multi-user arrangement or that native subscriptions expose a precise token-to-quota conversion. Before broad distribution, separately review the actual provider terms and supported account arrangements. For this founder pilot, do not broaden account use beyond the owners' permitted native workflows.

Preserve the already selected, separately authorized dsh API route. “No automatic paid fallback” does not mean delete that existing route; it means no native subscription failure silently becomes a newly billed API call or another owner's session.

## 7. Current documented telemetry bindings to qualify

Codex documents `account/rateLimits/read` and `account/rateLimits/updated`, with a backward-compatible bucket and optional `rateLimitsByLimitId`. Preserve each returned window's actual duration, utilization and reset timestamp rather than hardcoding a five-hour interval. Optional earned-reset information is not an automatically spendable project resource: redemption is a separate owner-controlled effect and remains disabled in the initial collector. Do not call broader account-activity or credit-notification actions just to populate a resource card. [W01]

Claude Code documents conditional `rate_limits.five_hour` / `seven_day` fields with `used_percentage` and `resets_at`; the status-line source also distinguishes a gateway `spend_limit` and live `effort.level` when supported. The initial collector allowlists relevant fields on the owner host, preserves absent windows and qualifies the installed version/mode. It does not transmit the whole status-line payload or infer that native reasoning-effort support is identical across models. [W02]


## Current continuation binding

This is the v2.0 normative integration specification. The current M02 runtime, PR32 registry/artifact work and Luis-owned side-panel implementation are described in [current baseline](../02_CURRENT_BASELINE.md). Local source/fixture work can proceed while only the relevant live dependency remains gated. Paperclip is not the first private Bot job store: owner-private messages/packages remain in Sophia until an exact human share. [Source namespace SCM](../sources/REGISTER.md); new code and provider behavior still require the listed goal acceptance.
