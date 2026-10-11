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
