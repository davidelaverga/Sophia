# CON-01 G2: what a subscription route must qualify before D-4 binds one (proposed; CX-0118)

**What this is.** The smallest documentation and installed-code qualification that any reply route must pass before D-4 (BINDING_MAP §13) could bind it. Codex asked for it in CX-0118.
- **It binds no route.** D-4 stays open: neither shown impossible for every topology nor selected. Asks stay `blocked` (`no_grant`).
- **No fallback:** there is no pay-as-you-go or API fallback (§8.4).
- **Nothing was done to an account:** no credential copied, no sign-in, no client registered, no provider called.
- **Nothing new in the code:** no new harness, no version change and no shared change.
- **Private values stay out:** private account, quota and mailbox values stay out of this file, issues and logs.

**Read at:** the frozen runtime install at Step B `f36a8fa0`, on Node 24.21.0:
- `@deepseek-ai/dsh-llm-pi-ai` 0.2.0-rc.2;
- `@earendil-works/pi-ai` 0.87.1, the package dsh-llm-pi-ai depends on.

Files were read only; nothing was run against a network.

**The vendor pages** are as Codex read them in CX-0118, because this container's network policy blocks `developers.openai.com` (§8.4):
- `developers.openai.com/siwc/token-sharing-open-source/models-and-inference`, and its overview.
- `developers.openai.com/siwc/token-sharing-open-source/preview-limitations`, its unsupported-fields bullet (Codex's retained CX-0118 copy, `051ee06d`).
- **The current accounts and sessions pages:** they point to ChatGPT Settings, Usage, and shared limits. That is not proof of an app quota endpoint.
- **`learn.chatgpt.com/docs/app-server`** (`developers.openai.com/codex/app-server` redirects there), §6, as Codex read it in its CX-0119 recheck. It documents the Codex App Server's account rate limits; §2.5 gives the detail.

**Path keys** (all under `.artifacts/runtime/node_modules/.pnpm/`):

| Key | File |
|---|---|
| DSH | `@deepseek-ai+dsh-llm-pi-ai@0.2.0-rc.2_…/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js` |
| CODEX | `@earendil-works+pi-ai@0.87.1_…/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js` |
| SHARED | the same `dist/api/openai-responses-shared.js` |
| PUBLIC | the same `dist/api/openai-responses.js` |
| OAUTH | the same `dist/auth/oauth/openai-codex.js` |
| RESOLVE | the same `dist/auth/resolve.js` |
| CREDLOCAL | `@deepseek-ai+dsh-credentials-local@0.2.0-rc.2_…/lib/index.js` |
| ATOMIC | `@deepseek-ai+dsh-atomic-write@0.2.0-rc.2_…/lib/index.js` |

## 1. What the installed Codex path is today

- **Endpoint.** `https://chatgpt.com/backend-api` (CODEX:20), plus `/codex/responses` (CODEX:458-466).
  - The transport is `auto`: a WebSocket first, then SSE (CODEX:184, 239-243).
  - Its headers include `originator: "pi"` and a `chatgpt-account-id` taken from the token's claim (CODEX:1250-1280).
  - **It is not the public Responses API.** pi-ai's `openai` provider is that one: `https://api.openai.com/v1` with an API key (PUBLIC:122).
- **Sign-in.**
  - pi's own OAuth client, a fixed module constant `CLIENT_ID` (OAUTH:22), against `https://auth.openai.com/oauth/token` (OAUTH:23-25).
  - It is not an app-specific registration.
  - The grant is stored in the dsh home's `.credentials.yaml` under `llm-pi-ai/openai-codex`, mode 0600 (DSH:1941-2005; CREDLOCAL:49, 58, 557-558).
- **No wire cap.**
  - The Codex body (CODEX:389-430) carries no `max_output_tokens`.
  - `maxTokens` is computed (`dist/api/simple-options.js:17`) and then never read on this path.
  - **Codex's offline L0 capture:** a synthetic unusable token, a throw in `onPayload` before any fetch, and a network guard. `maxTokens` 1, 23 and 4096 produced byte-identical bodies with no `max_output_tokens`, and 0 network, provider or native calls. That is not subscription or answer evidence.
  - The public path does send the field when `maxTokens` is set and the model allows it (`supportsMaxOutputTokens`, PUBLIC:230-231).
- **Retries.**
  - dsh's `profileOptions` sets `maxRetries: 0` (DSH:1684), so SSE makes one attempt (CODEX:22, 258-321). An upstream default isn't the effective value.
  - The WebSocket path has its own one-shot resends, not governed by `maxRetries`: `previous_response_not_found` and the connection limit (CODEX:220-227).
- **Terminal handling.**
  - `response.completed`, `response.done` and `response.incomplete` all end reading (CODEX:544-553).
  - **A status outside the known set becomes `undefined`** (CODEX:558-562), and `undefined` maps to `stop` (SHARED:660-662). So an unrecognized terminal would count as a normal stop.
  - A stream with no terminal event is an error (SHARED:656-658; CODEX:1094-1096).
  - dsh's `mapStopReason` (DSH:1402-1456) has no default case.
  - dsh's `classifyPiAiError` (DSH:1380-1391) works by regex on the message and has no unknown class. By inference only, untested: the usage-limit message (CODEX:1233-1239) would fall to `PI_AI_ERROR`.
- **Limit telemetry, in the audited seam only.** That seam is the Codex provider (CODEX, SHARED) and dsh-llm-pi-ai (DSH).
  - It reads no rate-limit or usage header. A search of pi-ai's `dist` and the installed `@deepseek-ai/*` libraries for `x-codex`, `x-ratelimit` and `ratelimit-remaining` found none.
  - Its only hook is `onResponse` on SSE (CODEX:283), and dsh doesn't pass it.
  - Nothing beyond that seam was audited.
- **Refresh.**
  - Refresh tokens rotate: a refresh must return a new `refresh_token` (OAUTH:103-110), and the new grant is persisted through the store's `modify` (RESOLVE:64-108).
  - dsh's lock is a `.lock` file holding the owner's pid. It does not hold across hosts or PID namespaces (ATOMIC:180-181), and nothing coordinates it with another client's store.
- **A comment disagrees with the code.** DSH:856 says the adapter holds no OAuth store, but `apply()` wires one in (DSH:2571-2574). So a keyless `openai-codex` profile would resolve a stored grant.

**So the installed Codex path is not the documented app-specific flow.** Per Codex's reading, that flow requires:
- the public `api.openai.com/v1/responses`;
- its completion terminal handling;
- the account's current model catalog.

The overview limits it to open-source apps run locally or self-hosted, and sends a remote service to the partner process. None of this decides D-4.

## 2. The five things a route must qualify

Each one names the documentation that must state it, the installed code that must show it, the test that proves it, and where it stands today. Any one unmet means no route is bound.

### 2.1 Eligible topology and sign-in identity

- **Documentation:** the flow named exactly, with a dated quote of its page, as Codex reads it. It must state:
  - whose account it uses (the user who operates the app, their own);
  - which client registration;
  - which endpoint;
  - which topologies it allows. Hosted Sophia is either one of them or the partner process's.
- **Installed code:** an offline capture of one request, with the network guarded and a synthetic unusable token. It records the exact URL, client and headers, and they must match the documentation.
- **Today:** **unmet.**
  - The only installed subscription path uses `chatgpt.com/backend-api` and pi's fixed client.
  - Whether a token from the documented flow works with the installed public provider is **unknown**, and not tried.
  - Hosted Sophia's topology is **undecided**.

### 2.2 A cumulative cap that is enforced, not declared

- **What is needed.** A reservation (S2) can be honest only if each call's worst case is finite and known before the call leaves. So two things must hold:
  - **(a) A hard bound** on each call, of one of two kinds:
    - a cap the request carries, which the eligible flow documents and honours, set from the reserved amount;
    - or, if that documented flow forbids or omits such a field, another hard bound the flow documents, qualified the same way.

    A wire cap is not a universal prerequisite. The bound plus the reservation and its accounting are.
  - **(b) Every request on the wire reserved first,** including transport resends (CODEX:220-227) and any recovery dsh composes, within `max_calls_per_reply` (at most 2, §8.4).
- **Not a bound:**
  - `maxTokens` metadata;
  - cancelling a stream part-way;
  - a guess from earlier usage.
- **Without a documented, qualified bound,** the route stays unsupported and unbound. No other provider is chosen to get one.
- **Overruns:** an overrun is recorded at what it used, and the next reservation is refused at the total.
- **Tests:**
  - **The offline capture:** the documented bound is in force for each of several reserved values. For a wire cap, the body's cap equals the reservation. Today's identical bodies are the fail-before for that form.
  - **A stub (L1) answering past the bound:** the reply records the overrun and the next ask is refused (`limit_reached`).
  - **A forced WebSocket resend:** it is reserved, or it never leaves.
- **Today:** **unmet.**
  - The Codex path sends no cap, and its WebSocket resends bypass `maxRetries`.
  - **The current SIWC preview forbids `max_output_tokens`.** Codex read this on `developers.openai.com/siwc/token-sharing-open-source/preview-limitations`, in its unsupported-fields bullet; the models-and-inference page doesn't mention the field. So the wire-cap form is unavailable on that flow.
  - No other hard bound for that flow is established, and none is qualified here. That is not proof that none exists. Until one is documented and qualified, §2.2 is unmet for it, and the route stays unsupported and unbound.

### 2.3 Terminal and unknown outcomes

- **Documentation:** the flow's own terminal events and statuses, and the usage each reports.
- **Two separate decisions.** Each outcome decides:
  - the reply's label: its state and reason;
  - how its reservation ends.

  A failure label never settles a reservation by itself. Only a known terminal with known usage does.
- **Required mapping:**
  - **A documented terminal event, received for this request:**
    - **completed:** the answer, as today. Only a documented completed status counts.
    - **incomplete for the output bound:** `failed`/`max_tokens`.
    - **any other incomplete, failed or cancelled status:** `failed` with its reason.
    - **The reservation in each of these cases:** `settled` from the usage that event reports. If it reports none, `uncertain`.
  - **Everything else:** `outcome_unknown`, with the open reservation `uncertain`, the same durable request and allowance, and no automatic re-run (§8.2.1, §8.4). That covers:
    - an unknown status;
    - a stream or WebSocket ending without a terminal event;
    - an idle timeout;
    - an abort;
    - an unclassified error;
    - the generic error, auth and usage-limit failures whenever this request's non-execution is unproven.

    The reason may name the class (for example the usage limit, which is never retried or reset). The state and the reservation stay unknown.
  - **`released` only with positive proof.** That means proof, correlated to this request, that it was never dispatched **and** can no longer be dispatched. "No response began" is not that proof. With the installed pi SSE path (a fake fetch, `maxRetries` 0), Codex's offline run showed two cases return identical error shapes with no response: a rejection before dispatch, and a request accepted whose headers were then lost. What counts as such proof is part of this qualification. None is identified in the installed code.
- **Tests (stub, L1):**
  - **One case per shape above.** Each checks the reply's state and reason and the reservation's end, separately.
  - **The two indistinguishable shapes:** a rejection before dispatch, and an accepted request with lost headers. Each ends `outcome_unknown` with the reservation `uncertain` unless the proof above exists.
- **Today:** **unmet.**
  - An unrecognized status maps to `stop` (CODEX:558-562; SHARED:660-662). **Codex corroborated this at L0** with non-empty synthetic text, a future status ending done or stop and a missing terminal ending in an error, with 0 real network, provider or native calls.
  - dsh has no unknown class.
  - The usage-limit message is unclassified.

### 2.4 Rotating tokens under concurrency

- **What is needed.**
  - One owner refreshes each account's grant, and a rotated refresh token is used at most once.
  - **How a reply child authenticates is pending Q7, with the vendor's documentation.** The candidates include:
    - a copy in its B-1 home;
    - a short-lived token;
    - a single owner that calls for it.

    None is an authorized solution here, and this file draws no legal conclusion about any of them.
  - No credential is copied or transferred now (§8.4).
- **Tests:**
  - **Two concurrent refreshes against a stub token endpoint that rotates:** exactly one refresh request is sent, and the other caller reads the new grant.
  - **A stale refresh token** is never sent twice.
  - **A refresh failure** gives the reply the auth reason, with its state and reservation decided as in §2.3, and starts no retry loop.
  - **A second store or host sharing the grant:** shown unsupported, or coordinated.
- **Today:** **unmet.**
  - dsh's lock holds within one host and PID namespace only (ATOMIC:180-181).
  - What the vendor does when a rotated refresh token is reused is **unknown** here.

### 2.5 Trusted remaining-limit telemetry

- **Documentation:** a documented endpoint, header or notification that reports the remaining limit to an app.
- **A documented candidate: the Codex App Server.** `learn.chatgpt.com/docs/app-server` §6, as Codex read it, documents:
  - a request, `account/rateLimits/read`;
  - a notification, `account/rateLimits/updated`;
  - limits keyed in `rateLimitsByLimitId`, each with `usedPercent`, `windowDurationMins` and `resetsAt`.

  This is a telemetry source **candidate**:
  - It is documented for the App Server's own sessions.
  - It is not proof that the pinned dsh route can use it.
  - It is not authority to start another executor or sign-in flow.
- **The pinned dsh integration: unqualified.**
  - A read-only search of the installed runtime at `f36a8fa0` finds no `account/rateLimits` call and no App Server client in any `.js`, `.mjs` or `.cjs` file.
  - In the audited seam (§1), the only response hook is `onResponse` on SSE (CODEX:283), and it is unused.
  - The SSE path's own limit headers are not established as a source either.
- **Before any source counts,** these are bound, from its documentation and a qualified capture:
  - **identity:** which account, and which limit (by its id), a reading belongs to, matched to the route's own sign-in (§2.1);
  - **freshness:** when the reading was taken and its window. A reading past its window, or one taken before the latest call settled, is shown as stale, never as current;
  - **an unavailable state:** a source that doesn't answer is shown as unavailable, never as zero or as full;
  - **privacy:** a private account's quota values stay out of shared records, issues and broad logs. They are shown only to whom the owner decides.
  - **read only:** reading has no effect, with no reset, no credit purchase and no change to the account.
- **Today:** **not established and not qualified for Sophia's route.**
  - The bounded reading found the user's ChatGPT Settings, Usage and shared limits, and the App Server candidate above.
  - That is not a finding about what else exists.
- **Davide's requirement stays unmet:** showing the remaining subscription cap.
  - Sophia's own counters (S2) do not meet it.
  - Neither does a link to ChatGPT Settings.
  - Neither does the App Server candidate until it is qualified for the route.
- **Until a source is qualified:**
  - Sophia's allowance is its own ledger's count, shown as Sophia's;
  - no vendor remaining limit is displayed or inferred;
  - the usage-limit error is read as a class only (§2.3).

## 3. The order, once D-4 is askable

1. Codex records each page's dated quote for §2.1, §2.2, §2.3 and §2.5.
2. The offline captures and stub cases above are written as CON-01 tests against the installed runtime, labelled L0 or L1. That is only if they need no new harness, version or shared file; otherwise they wait for the runtime owner (Q6, Q7).
3. Only then does D-4 put a named route, with its documentation, to Davide. Nothing here asks him to approve one.

No provider call, sign-in, registration or credential transfer happens at any step of this proposal.

## 4. Result for the pinned adapter and hosted topology: a demonstrated incompatibility (CX-0130)

Codex asked for one supported subscription-only route, or the exact incompatibility with evidence (CX-0130). Its read-only recheck found the overview, preview-limitations, accounts and App Server pages byte-identical to its CX-0118 and CX-0119 copies.

**Read at:** the pinned runtime install is unchanged at current main `e0200f1a`: `config/runtime-unit.json` is byte-identical to Step B `f36a8fa0`, SHA-256 `ced15d84…`. Installed files, read only:
- `openai-responses.js` `3e95145f…`;
- `openai-codex-responses.js` `6e69310d…`;
- `auth/oauth/openai-codex.js` `41432753…`.

**No supported subscription-only route exists for CON-01's hosted Ask with the pinned adapter.** Each gap below is enough on its own.

| § | The gap | Evidence |
|---|---|---|
| 2.1 sign-in | The pinned adapter has no implementation of the documented app-specific flow. Its only installed OpenAI subscription sign-in is pi's own OAuth client, a fixed `CLIENT_ID`, for `chatgpt.com/backend-api` | OAUTH:22–25. `dist/auth/oauth/` holds `openai-codex` and other vendors' modules; nothing else for OpenAI |
| 2.1 endpoint | `openai-codex` calls `chatgpt.com/backend-api/codex/responses`, not the documented `api.openai.com/v1/responses` | CODEX:20, 458–466 |
| 2.1 topology | Hosted Sophia answers many members' asks from a remote service: Render API and runtime, Supabase database (OP-0002-r4 target identity). Per Codex's dated reading, the documented flow is for open-source apps run locally or self-hosted by their user, and sends a remote service to the partner process | the overview, as Codex read it (CX-0118, rechecked identical) |
| 2.1 requesting account | The documented flow uses the operating user's own account. An ask by another member answered on one person's subscription is not documented as eligible, and D-4 forbids assuming it | D-4, §13 |
| 2.2 hard bound | `openai-codex` puts no cap on the wire (CODEX:389–430). The public provider puts `max_output_tokens` on the wire whenever `maxTokens` is set and the model's compat allows it, the field the SIWC preview forbids (PUBLIC:230–231). With that compat off, it carries no cap either. No other documented hard bound is established | PUBLIC:16, 62, 230–231; preview-limitations, as Codex read it |
| 2.3 terminal | An unknown status maps to `stop`; dsh has no unknown class | CODEX:558–562; SHARED:660–662; DSH:1380–1456 |
| 2.4 refresh | Rotated refresh tokens, with a lock that holds within one host and PID namespace only | OAUTH:103–110; ATOMIC:180–181 |
| 2.5 quota | No remaining-limit source in the pinned seam. The App Server's `account/rateLimits/read` belongs to another executor, which is not authorized | §2.5 |

**The one topology the documentation might fit** is a runtime run locally by the account holder, answering only that holder's own asks. It still fails here: the pinned adapter doesn't implement the documented sign-in, and neither installed provider has a documented hard bound (§2.2). So no topology gets a supported route on the pinned adapter.

**Consequences:**
- D-4 binds no route; Asks stay `blocked` (`no_grant`).
- There is no fallback: no pay-as-you-go, no other provider, no account rotation, no extra credits and no hidden reset.
- Sophia's allowance stays its own ledger's count, shown as Sophia's (§2.5).

**What would change this** lies outside CON-01, and is neither proposed nor asked:
- a vendor-documented flow for a hosted, multi-member service, with a documented hard bound, terminal semantics, refresh lifecycle and remaining-limit source;
- an adapter implementing it, qualified by the runtime owner (Q6, Q7).

## 5. Codex's installed-adapter wire capture: bounded independent evidence (CX-0151)

Codex ran the actual installed pi-ai 0.87.1 serializers offline, and asked that the result be added here as bounded independent evidence, with its limits ([CX-0151](https://github.com/davidelaverga/Sophia/blob/73f0fff8a9f95147ffc606cd8e4fad4bc33217cc/docs/coordination/CON-01/CX-0151.md); [#198 comment 6117873422](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6117873422)). **It is Codex's evidence.** CON did not run it, and nothing here re-runs or extends it.

**What was run:**
- **The probe and its receipt:**
  - the probe, `adapter-wire-probe.mjs`, SHA-256 `470f2f41b8c45855bdec93a66d2718136c8f0446cd25e738233f40ff0fa6a4ab`;
  - its receipt, `adapter-wire-receipt.safe.json`, SHA-256 `6e41d2123dae25aa60022594da6224ac9782f02372e15bade106418b52eaa153`.
- **The environment:** Node 24.21.0 on Darwin, with an empty process environment. All five assertions passed, exit 0.
- **The installed modules,** imported from the existing candidate's `.artifacts/runtime` (`3b1a7ea6`, left clean):
  - `api/openai-codex-responses.js` `6e69310d77278231cfc87d7f03ee815d4a0f2ff273e6c43fcee6835e7df2b0c7`;
  - `api/openai-responses.js` `3e95145f94ac2a255d1adc0ae65cf02c2e6d479f7a2dbf5c466db21885c29ec6`;
  - `utils/transcript.js` `cd63514661b4036c3bcdda11a108f6be853f790a01216bf30fa80121e4fd320f`.

  The first two match the hash prefixes §4 recorded for the files it read.
- **The inputs:**
  - a synthetic model, which selects no route;
  - an unsigned synthetic token that pi only decodes structurally. It is not a credential and was never sent;
  - forced SSE, and `maxRetries` 0;
  - one injected `fetch` per case. It captured the request and answered with a local 400 sentinel.

  A guard on the global `fetch` saw 0 calls.

**What it captured:**

| Adapter | Requested `maxTokens` | `max_output_tokens` on the wire |
|---|---:|---:|
| `openai-codex`, SSE | 16 | absent |
| `openai-codex`, SSE | 512 | absent |
| public Responses, default compatibility | 512 | 512 |
| public Responses, `supportsMaxOutputTokens: false` | 512 | absent |
| public Responses, default compatibility | 1 | 16 |

- **The URLs** were constructed and captured, never contacted: `https://chatgpt.com/backend-api/codex/responses` and `https://api.openai.com/v1/responses`.
- **Every captured body** equalled `onPayload`'s, with `store: false`, `stream: true`, an array input and no tools. The Codex body was zstd-compressed, and was decompressed for inspection.

**What it corroborates here:**
- **§1's "No wire cap" for `openai-codex`,** now through the actual serializer and an injected fetch. §1's earlier capture threw in `onPayload` before any fetch. The body carries no `max_output_tokens` at either requested value.
- **§4's §2.2 row,** for the public provider:
  - it sends `max_output_tokens` under its default compatibility, and omits it with `supportsMaxOutputTokens: false`;
  - Codex's fresh reading of the preview-limitations page (2026-10-12) still excludes `max_output_tokens`, so the default serialization conflicts with that documented field requirement;
  - omitting the field establishes no hard output bound.
- **One detail, recorded only:** under its default compatibility, the public adapter raised a request of 1 to 16. Nothing further is concluded from it here.

**What it doesn't establish** (Codex's limits, kept as stated):
- **It is not a provider's rejection, a useful answer, or account authorization.** The 400 was injected locally.
- **It qualifies none of these:** sign-in or OAuth, the credential lifecycle, account eligibility or topology, a quota source or telemetry, uncertainty accounting, or a supported finite execution bound.
- **The WebSocket transport was not captured,** since the Codex cases forced SSE. So it says nothing about §2.2(b)'s WebSocket resends (CODEX:220-227).
- **It doesn't widen §4.** §4's result stays a result about the pinned adapter and the hosted topology, as read. Beyond the pinned adapter, neither this capture nor §4 shows that every supported route, topology or execution bound is impossible. §1–§2.5 name what a different, qualified flow and adapter would need.

**Unchanged:**
- D-4 binds no route, and Asks stay `blocked` (`no_grant`). Ask stays disabled.
- No fallback, no provider switch, no new harness, no provider execution.
