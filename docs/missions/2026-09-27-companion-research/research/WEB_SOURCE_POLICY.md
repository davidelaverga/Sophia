# M03 source access — provider adapters, provenance and limits

## 1. Policy owner and selection

One Sophia source-access facade receives trusted project/task/attempt/grant context, performs disclosure and allowance checks, calls the selected native/provider operation, captures eligible evidence and returns bounded passages. Do not use an ambient mutable “current task” variable shared across concurrent calls. Each invocation carries explicit trusted operation context.

Initial configured choices: Tavily for search; Jina for extracted public page content. Native HTTP is a distinct direct-fetch route selected explicitly when configured/authorized. An unavailable configured provider is an explicit error. No automatic switch to whichever key happens to exist.

The native web service's selection semantics are already strict: configured missing/unavailable IDs error, no configured ID with multiple usable providers is ambiguous, and registration order does not choose a winner. Set the intended provider explicitly rather than relying on a lone provider today. [SRC-15](../SOURCE_REGISTER.md#src-15)

## 2. Tavily adapter

Implement `WebSearchProvider` at the exact M02 unit. Its `available()` is a cheap local configuration check, not an API call or evidence of live health. `search(request, signal)` maps actual returned sources into native title/URL/snippet/date fields, forwards cancellation, observes an overall timeout and returns bounded results/truncation.

Keep basic search parameters deliberate. Initial configuration disables provider-generated answer and unnecessary images/raw-content retrieval; request usage/request ID where the selected API supports it. Do not invoke Tavily's autonomous research service: Sophia's own worker owns the investigation. Native result types do not contain every vendor receipt field; record those in the application operation/evidence record instead of inventing extra native properties. [SRC-18, PUB-01](../SOURCE_REGISTER.md)

Do not install a large SDK merely for one HTTP endpoint unless it adds qualified value; a typed bounded HTTP adapter is acceptable. Either way pin the actual dependency version and verify error/timeout behavior.

## 3. Jina extraction adapter

Use the Reader API as the source extraction service, configured explicitly with the approved credential. Request a deterministic supported output type and capture its actual response. A private/logged-in/signed URL is not eligible simply because it uses HTTPS. No browser cookies or user account credentials are forwarded.

Return application `SourceReadResult`, conceptually:

```text
operationId, providerId, providerRequestId?
requestUrl, reportedFinalUrl? (unknown permitted)
providerHttpStatus, originHttpStatus? (unknown permitted)
retrievalKind: extracted_text | direct_http | uploaded_source
sourceId, storedContentHash, contentKind, extractionVersion
capturedAt, publishedAt? (source-provided only)
coverage: complete_for_returned_extraction | truncated | partial | unsupported
excerpt, locator, nextCursor?, limitations[]
```

`complete_for_returned_extraction` does not assert full website/PDF/table coverage. A stored extraction hash is not the original document's byte hash. Unknown origin status is valid; substituting the proxy's 200 is not. Register as a native fetch provider only if an exact tested response contract supplies its mandatory target fields honestly; otherwise keep this thin extraction adapter beside native direct HTTP. [SRC-18](../SOURCE_REGISTER.md#src-18)

## 4. Source eligibility before network access

The call must have an active task and permitted provider/data route, within the current authority and allowance. The source must be an explicit allowed input, a search result, or a link extracted from an eligible inspected source and admitted under the same policy. Record that provenance.

Validate URL scheme and syntax with a real parser; reject embedded credentials, local/intranet/private-network targets, disallowed ports, secret/signed/private access URLs and prohibited redirects. Direct HTTP uses the native public-address/redirect protections, tested on the selected release. A hosted extractor is not a loophole around a blocked target. When the proxy cannot provide full redirect/origin evidence, disclose that limitation and restrict it to approved public targets; do not assert the direct-fetch network guarantees automatically apply inside another provider's infrastructure.

Do not place private project quotations, secret names/values, participant identifiers or private-file text into a public search query unless that exact disclosure is authorized. De-identify/abstract where the question remains answerable; otherwise ask or use eligible project sources. Every fallback is another recipient decision, not just another URL.

Search snippets and web page instructions are untrusted evidence. They cannot change tool grants, role identity, task acceptance, source policy or budget. Model-facing tools pass through this facade; global native web tools remain hidden/denied for the research preset. Only approved trusted plugins are installed.

## 5. Capture, paging and citations

Capture supported content up to the configured byte/page cap into the existing source system. Return excerpts with immutable source identity, actual hash, locator and continuation handle. Explicitly distinguish local capture limit, upstream extraction truncation and unsupported content. A page title/date is omitted when unknown.

Deduplicate identical source content within allowed scope by identity/hash without confusing different versions or audiences. Re-reading an existing captured passage need not make a paid vendor request. Cache keys include provider/extraction version and scope; corrected/revoked sources invalidate derivatives immediately according to the canonical source policy.

A next cursor is bound to source/version/eligibility and requested range, not an arbitrary filesystem path or URL. If the continuation is unavailable, say so; never label an unobserved tail empty. Important citations point to retained content or qualified source links, not an invented bibliography.

## 6. Proposed pilot defaults

These are engineering defaults for a bounded founder experiment, **not permission to spend** and not guaranteed optimal settings. Record their resolved values in the admitted task. Owner-approved limits can be lower.

| Setting | Initial proposed value/behavior |
|---|---|
| Workers / source concurrency | One research worker; one provider source call at a time initially. |
| Ordinary external research | Up to five searches and eight external reads; inherited as a useful trial bound from the old research recipe, not a mandatory quota to consume. |
| Search results per call | Up to five; validate/cap both request and response. |
| Source-only or rendition | Zero external search/read calls by default. |
| Inline passage | At most 6,000 characters plus structured metadata; further passages by cursor. |
| Text capture | At most 2 MiB decoded per source; record truncation/overflow, never unbounded buffering. |
| PDF intake when enabled | At most 10 MiB and 40 pages initially; partial/unsupported explicitly represented. |
| Network deadline | Search 20 s; Reader/direct retrieval 30 s overall, subject to smaller remaining task time; includes retry time. |
| Retry/repair | At most one eligible transient network retry and one format repair within remaining allowance; no retry for denial/auth/unsupported data or unknown effect without reconciliation. |
| Monetary/token limits | Required from actual configured policy/approval for paid work; absent is not unlimited. |

The current tools may require different documented provider timeout settings; qualify those without changing the independent application deadline. A provider's remote page timeout cannot replace a local cancellation/deadline.

## 7. Reservation, cancellation and failure

Atomically reserve the permitted call/cost envelope before making a provider request. Keep operation identity across retries. Record actual usage, release only definitely unused reservations, and mark uncertain charges/outcomes pending reconciliation. Parallel workers introduced later must use the same reservation service; summing counters after calls is not sufficient.

HTTP abort stops local waiting, not necessarily provider-side processing/billing. Preserve that uncertainty rather than asserting remote cancellation. Hold/Stop prevents new requests and publication; in-flight effects settle or are reconciled. All work remains charged to the original cumulative envelope unless a separately authorized increase is recorded.

Typed failures distinguish unavailable/unauthorized provider, denied source, timeout, rate limit, malformed output, no results, unsupported MIME, truncated capture, storage failure and cancelled/unknown operation. Public logs carry identifiers and safe codes, not provider response bodies, queries containing private content or secrets.

## 8. Required conformance cases

Provider missing; malformed response; 401/403/429/5xx; timeout before/after request; user cancellation; exactly-at-cap concurrent admission; long Unicode source; a needed fact after character 4,096; repeated source with changed version; denied private URL; redirect to private host for direct HTTP; unknown origin status from extraction; PDF/scan/table coverage; revoked source cursor; snippet-only evidence; unauthorized fallback; and stored-content reread without repeated paid retrieval.

Keep provider-specific fixtures labelled and sanitized. One real authorized search/read smoke qualifies connectivity/shape, not every retrieval quality claim. Record actual source coverage, latency, usage and extraction limitations before enabling the provider for the founder task.
