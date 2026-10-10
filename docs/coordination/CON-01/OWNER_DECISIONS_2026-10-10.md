# CON-01 owner decisions — 2026-10-10

Authority: Davide's direct answers in reviewer session `01a1224a-32b4-7222-a017-50a277572d95`, received before the 09:32 UTC coordination checkpoint. This records source-design decisions and setup intent; it is not an executable deployment or inference approval.

## Accepted source design

**D-6: option C accepted.** Each read-only Sophia execution attempt belongs to its conversation reply request; it creates no task or goal.

**B-1: throwaway harness home per response execution attempt selected.** Use the existing pinned runtime and admission machinery, with isolated writable state, not another harness or a new VM. Sophia's saved conversation/project records remain authoritative. Assemble bounded, currently eligible context anew; retain no reusable native conversation history across completed replies.

Required qualification, before Ask activation:

1. Prove the configured home contains the attempt's actual writable session state. Never switch a process-global home across concurrent requests. Approved shared binaries/static assets may be read-only; unrelated mission homes remain untouched.
2. Inventory session files, journals, temporary files, caches, logs and all other content-bearing host copies. Contain, suppress or govern each. Deleting the named home must leave no overlooked copy elsewhere.
3. Stop or settle execution before deleting writable state. Persist the authorized result and delivery/accounting state first. Cover success, failure, cancellation, timeout, restart and orphan recovery. A cleanup failure remains unresolved; it is not a deletion receipt.
4. Withdrawal fences generation and publication, settles the affected execution and cleans its host copies. A late result cannot restore withdrawn content.
5. A fresh home or retry preserves the same logical Ask, cumulative allowance and publication identity. Reconcile uncertain dispatch before retry; no duplicate answer or allowance reset.

These choices were relayed to the exact Claude mission session `session_01KUDtFK9gWthsXSrepcLQz3` at approximately 09:32 UTC. Implementation, isolation, cleanup and real-provider qualification remain open.

## Requested setup

Davide requested a **new Sophia project**, connections to **his Claude Code and Codex through subscriptions**, and visibility of **remaining subscription capacity in Sophia**. Existing personal project contents are not designated test data. Native coding integration remains outside CON-01's saved-conversation scope; connection/usage prerequisites must be explicitly identified rather than silently expanding this feature.

The setup answer does not identify account roles, a supported selected provider route/model, credential-store references, finite execution allowance or expiry. Claude Code and Codex are execution resources, not two Sophia account subjects. No paid API fallback, extra-credit purchase, quota reset, new payer or provider switch is authorized.

Later direct owner answer in this session: **create a second synthetic account for testing**. This replaces the request to name a second existing account; it does not supply its mailbox or login credentials. Actual Supabase account creation and project membership are now proposed bounded setup effects. The live Studio uses email OTP, so the owner-controlled test inbox reference is pending. No account or project has been created yet.

## Subscription discovery — read-only, not connected

Official documentation reviewed on 2026-10-10:

- [OpenAI ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source) describes OAuth registration and stable host identities for open-source/local apps; paid or remotely hosted apps are directed to the partner interest process. Eligibility for Sophia's actual hosted topology remains unproven.
- [OpenAI self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms) explicitly documents an open-source app on a remote VM for the same user/workspace, with protected credentials for that tool registration. Remote location alone does not establish ineligibility. This is distinct from offering a hosted service; actual topology and supported route remain unbound.
- [Codex app-server](https://learn.chatgpt.com/docs/app-server) documents subscription rate-limit readings and updates. Existing app-server authentication is for local/open-source apps, not commercial/hosted services. A desktop reading does not prove hosted Sophia has that capability.
- [Claude Code status line](https://code.claude.com/docs/en/statusline) documents five-hour and seven-day subscription usage percentages and reset times. These fields are optional, subscriber-specific and appear after a response. Context-window capacity and estimated API cost are different measurements.
- [Claude account login policy](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account) distinguishes ordinary Claude/Claude Code subscription use from third-party application access. Sophia's proposed route needs a supported binding; vendor tokens must not be copied into Sophia custody.

The desktop Codex read-only usage tool returned a rate-limit record successfully. No account identifiers, balances, reset-credit identifiers or private credential values are copied into this public evidence. No subscription has been connected to Sophia and no new inference was dispatched by this discovery.

Proposed usage display requirements for Claude to bind: authenticated resource/account attribution; each reported window's remaining percentage and reset time; observation timestamp/staleness; explicit unavailable state for absent fields; separate included-plan capacity, Sophia's finite execution allowance and any monetary estimate. Never present missing telemetry as unlimited or zero usage, or silently refresh quota by changing account/home.

The explicit owner-native connection request is tracked through the existing Omnigent ownership/bindings. Native vendor authentication remains with the owner's native application; Sophia receives its own delegated connection. Resource enrollment/usage collection is currently proposed/fixture-backed, so it is a named setup dependency. The new request is not dismissed merely because the original CON pack excluded quotas, and it does not convert a native subscription into a generic inference credential.

## Readiness and next bounded action

D-6 and B-1 are selected source designs, not completed qualification. OP-0001 revision 2 remains `draft_not_authorized`. Combined `reviewed`, `authorized`, `deployed`, `app_verified` and `owner_accepted` remain false. No production change, subscription connection or provider call was performed here.

Next: Claude binds the existing-runtime implementation and subscription compatibility proposal; Codex reviews the immutable source and prepares a separate exact project-only setup batch if the current operation controls require approval before creating it.
