# Old Sophia web providers — source audit and reuse decision

**Inspected donor:** `davidelaverga/Sophia-Agent`, `codex/sophia-observability-v1@8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf`. Branch identity was refreshed for this pack. This is source inspection, not proof of actual old production configuration, working credentials, cost or quality. [SRC-07](../SOURCE_REGISTER.md#src-07)

## 1. What is actually selected in the example

The tracked `config.example.yaml` names Tavily for `web_search` (default maximum five results) and Jina AI Reader for `web_fetch` (a configured timeout value of ten). InfoQuest alternatives are commented. The exact `config.yaml` lookup at this pin returned Not Found, so the served runtime selection remains unverified. Do not convert example defaults into a live-deployment claim. [SRC-08](../SOURCE_REGISTER.md#src-08)

| Provider | Source implementation | Evidence-based status |
|---|---|---|
| Tavily Search | `community/tavily/tools.py`: search, normalized title/URL/content snippet | Implemented; example default search. |
| Jina Reader | `community/jina_ai/jina_client.py` + `tools.py`: Reader POST → HTML → readability Markdown | Implemented; example default fetch. |
| Tavily Extract | Same Tavily module: `extract([url])` | Implemented optional fetch path, not selected by that example. |
| Firecrawl | `community/firecrawl/tools.py`: search and Markdown scrape | Implemented alternative, not shown as default. |
| InfoQuest | Commented example entries | Example option only in this audit; implementation not newly inspected here. |

Current official Search/Extract/Reader/Scrape references were also consulted to bind the new path, not to claim that the old wrappers exercise every current API feature. [PUB-01–04](../SOURCE_REGISTER.md)

## 2. Useful donor patterns

The builder calls `builder_web_search` / `builder_web_fetch`, not hardwired vendors directly. Those wrappers resolve `web_search` and `web_fetch` configuration. Search normalizes results, records discovered sources and extends a per-task list of exact URLs. Fetch accepts explicitly supplied or discovered exact URLs, records a source and checks a per-task call counter. [SRC-09, SRC-10](../SOURCE_REGISTER.md)

Preserve the intent: provider-neutral tool semantics, task-scoped URL provenance, visible source records and bounded browsing. Port the semantics to the new TypeScript runtime/service boundary, not the LangChain tools, LangGraph Command updates or old middleware chain.

## 3. Problems not to transplant

### Silent content loss

Tavily Extract, Jina's readability output and Firecrawl's scrape output use a `[:4096]` substring. This is **characters, not a verified 4 KiB or token limit**. They do not return a next-passage cursor or a clear completeness record. The outer guarded fetch wrapper itself returns the provider result, so it does not restore content discarded by the provider wrapper. [SRC-10–13](../SOURCE_REGISTER.md)

New path: enforce a documented capture limit, retain the supported extracted content as a source, return a bounded excerpt plus a cursor, and disclose truncation/unsupported coverage. Do not interpret failure to find a sentence in the first excerpt as absence from the source.

### Timeout is not end-to-end

The Jina client sends an `X-Timeout` header but calls Python `requests.post` without a request timeout parameter. That header does not establish a local network deadline or cancellation guarantee. [SRC-12](../SOURCE_REGISTER.md#src-12)

New path: explicit AbortSignal, overall deadline, bounded response streaming and cancellation settlement. Provider-side page-loading limits can be set too; they are a separate control. Do not carry raw provider response bodies into public diagnostic logs.

### Budget counters are not strict reservations

The old search wrapper checks the count before the call and returns a delta to a summing state reducer. Its own comments describe a parallel boundary burst exceeding the intended call limit. Summing usage is better than losing increments, but it is not atomic pre-call admission. The helper also treats zero as no cap. [SRC-09](../SOURCE_REGISTER.md#src-09)

New path: atomic reservations under task/attempt allowance before egress; explicit cap semantics; failed/unknown requests accounted for; same operation reconciled on retry. Limits accumulate across steer/resume/rendition. A fresh process cannot reset them.

### URL provenance is not network safety or disclosure permission

The legacy normalizer mostly trims whitespace/trailing punctuation; the helper enables research for every task type. Exact discovery/explicit-user provenance is useful but is not a safe URL parser, a public-address/redirect check, or a grant to send private query terms to a vendor. [SRC-09, SRC-10, SRC-19](../SOURCE_REGISTER.md)

New path: keep discovery provenance and validate actual URL syntax/scheme/credentials, source scope and recipient disclosure. Direct fetch checks every redirect and public destination through the supported native mechanism. Derived outgoing links can be admitted with provenance within the same allowed scope; do not force a wasteful new search simply to read a legitimate link from an inspected document. Never use a reader proxy to bypass denied/private targets.

### Provider errors and extraction metadata

Legacy helpers commonly return error strings and have provider-specific config assumptions; for example, optional fetch implementations use the search configuration for their client key. New adapters use explicit configured credentials, typed/sanitized errors, real request identity and honest origin/extraction metadata. Empty content, unavailable provider, invalid credential, denied source, unsupported PDF and no search result are different outcomes.

### Research is not always web search

Do not import the older instruction to attempt web search before every substantive artifact. Supplied-source synthesis, format rendition and a current external investigation are distinct procedures. The research skill should select the appropriate one under the assignment. [SRC-09](../SOURCE_REGISTER.md#src-09)

## 4. Native mapping correction

At the selected rc.2 source, `packages/web/README.md` lists Exa, Perplexity, DeepSeek and anonymous HTTP. Tavily and Jina are not documented built-ins. The public service supports `registerSearchProvider`, `registerFetchProvider`, cancellation and explicit selection; no order-dependent implicit fallback is required. [SRC-14, SRC-15](../SOURCE_REGISTER.md)

Implement a small Tavily search provider using the native request/result interface. Preserve unknown titles/dates rather than inventing them. Scope, disclosure, capture and reservations remain in Sophia's source-access facade; the generic native service cannot infer them from a query string.

Jina needs a more careful fit. Native `WebFetchResult` requires target final URL and HTTP status and has a closed `html | text` body union. Reader-extracted Markdown can be text, but extraction-service success is not proof of the target's HTTP status/final URL. Keep a separate source-extraction result with nullable origin metadata unless a tested response supplies the actual fields. Do not force a lie to maximize nominal native reuse. [SRC-18](../SOURCE_REGISTER.md#src-18)

## 5. Initial decision

**Build:** Tavily Search adapter, Jina Reader source-extraction adapter, common source policy/receipts, and actual artifact evidence. Reuse native direct HTTP as an explicit qualified source route where useful. **Do not initially build:** three-way fallback, new research-as-a-service orchestration, site-wide crawling, arbitrary browser automation, video transcription or every vendor's complete SDK.

Codex verifies approved service/credential availability and runs the bounded conformance smoke under actual allowance. If one route cannot qualify, return a focused alternative proposal (native HTTP, Tavily Extract, or Firecrawl as appropriate), with disclosure/cost/coverage differences. Do not silently change the route because a timeout occurred.

## 6. Source coverage limit

This audit read the old branch, example provider entries, guarded search/fetch, Tavily module, Jina tool/client, Firecrawl module and URL/budget policy. It did not inspect old production secrets, traffic, every middleware, or every optional provider. It does not assert there are no newer implementations elsewhere in the repository. New Sophia is the sole implementation target.
