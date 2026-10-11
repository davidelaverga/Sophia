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
- **The current accounts and sessions pages:** they point to ChatGPT Settings, Usage, and shared limits. That is not proof of an app quota endpoint.

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
- **Limit telemetry: none read.**
  - No rate-limit or usage header is read anywhere in pi-ai or dsh.
  - The only hook is `onResponse` on SSE (CODEX:283), and dsh doesn't pass it.
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

- **What is needed.** A reservation (S2) can be honest only if each call's worst case is bounded before the call leaves. So two things must hold:
  - **(a)** the request carries a cap the endpoint documents and honours, set from the reserved amount;
  - **(b)** every request on the wire is reserved first, including transport resends (CODEX:220-227) and any recovery dsh composes, within `max_calls_per_reply` (at most 2, §8.4).
- **Not a cap:** `maxTokens` metadata.
- **Overruns:** an overrun is recorded at what it used, and the next reservation is refused at the total.
- **Tests:**
  - **The offline capture:** the body's cap equals the reservation for each of several values. Today's identical bodies are the fail-before.
  - **A stub (L1) answering past the cap:** the reply records the overrun and the next ask is refused (`limit_reached`).
  - **A forced WebSocket resend:** it is reserved, or it never leaves.
- **Today:** **unmet.** The Codex path sends no cap, and its WebSocket resends bypass `maxRetries`.

### 2.3 Terminal and unknown outcomes

- **Documentation:** the flow's own terminal events and statuses.
- **Required mapping:**
  - **completed:** the answer, as today, and only a documented completed status counts.
  - **incomplete for the output cap:** `failed`/`max_tokens`.
  - **any other incomplete, failed, cancelled, or an error event:** `failed`, with usage recorded.
  - **anything else:** `outcome_unknown`, with the open reservation `uncertain` and never re-run (§8.2.1, §8.4). That covers an unknown status, a stream or WebSocket ending without a terminal event, an idle timeout, an abort after the request left, and an unclassified error.
  - **a request shown never to have left** (no response began): `failed`, with its reservation `released`.
  - **the usage-limit error:** its own class, `failed`, with no retry and no reset.
- **Tests (stub, L1):** one case per event shape above, each checking the reply's state, the reason, and the reservation's end.
- **Today:** **unmet.**
  - An unrecognized status maps to `stop` (CODEX:558-562; SHARED:660-662).
  - dsh has no unknown class.
  - The usage-limit message is unclassified.

### 2.4 Rotating tokens under concurrency

- **What is needed.**
  - One owner refreshes each account's grant, and its refresh token is used at most once.
  - A reply home never holds the refresh token. Copying it would be intermediation and is not authorized (§8.4).
  - How a reply child gets a short-lived access token without it is the runtime owner's design (Q7). It is not proposed here.
- **Tests:**
  - **Two concurrent refreshes against a stub token endpoint that rotates:** exactly one refresh request is sent, and the other caller reads the new grant.
  - **A stale refresh token** is never sent twice.
  - **A refresh failure** ends the reply `failed` (auth) and starts no retry loop.
  - **A second store or host sharing the grant:** shown unsupported, or coordinated.
- **Today:** **unmet.**
  - dsh's lock holds within one host and PID namespace only (ATOMIC:180-181).
  - A per-reply home would need its own copy of the grant.
  - What the vendor does when a rotated refresh token is reused is **unknown** here.

### 2.5 Trusted remaining-limit telemetry

- **Documentation:** a documented endpoint or header that reports the remaining limit to an app.
- **Today:** Codex's reading finds only the user's ChatGPT Settings, Usage, and shared limits, and no app quota endpoint. **Unavailable.**
- **The rule until one exists:**
  - Sophia's allowance is its own ledger's count (S2), shown as Sophia's;
  - no vendor remaining limit is displayed or inferred;
  - the usage-limit error is the only signal (§2.3).
- **Installed code, if a source is ever documented:** dsh would have to pass a hook. Today `onResponse` exists on SSE only (CODEX:283) and is unused.

## 3. The order, once D-4 is askable

1. Codex records each page's dated quote for §2.1, §2.3 and §2.5.
2. The offline captures and stub cases above are written as CON-01 tests against the installed runtime, labelled L0 or L1. That is only if they need no new harness, version or shared file; otherwise they wait for the runtime owner (Q6, Q7).
3. Only then does D-4 put a named route, with its documentation, to Davide. Nothing here asks him to approve one.

No provider call, sign-in, registration or credential transfer happens at any step of this proposal.
