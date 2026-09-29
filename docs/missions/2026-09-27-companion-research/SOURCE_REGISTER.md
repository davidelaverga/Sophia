# Source register and evidence boundaries

**Prepared:** 27 September 2026. Sources marked fresh were read through GitHub or official public documentation for this packet. No repository clone/build/test, model/provider invocation, hosted inspection or effect was performed here. Links to source make the specification reloadable; they are not a complete offline repository snapshot.

## Previous artifacts retained

The full pass-2 design/source audit, prompts, manifest, checksum list and v0.1/v0.2 ledgers are retained unchanged in [references/pass2](references/pass2/README.md). The new three-PR sequence and explicit provider/schema refinements here supersede that packet only in their assigned scope. Its original local-only validation does not certify these missions.

Preserved source candidates: Sophia2911b037; dsh rc.1 `46a7f68b0922371ce7144b668b90e377d8e799f4`, rc.2 `477b4f420553e8a52c2fbccc464d7561b239c443`, prior observed main `21638c56315ae6a2b552d6091945d3144c9af32e`. M02 refreshes releases once and freezes its actual target. Do not call a historical observed main SHA the latest without rechecking.

<a id="src-01"></a>
## SRC-01 — PR #13 current metadata and release report
[PR #13 current metadata and release report](https://github.com/davidelaverga/Sophia/pull/13)

Fresh connector metadata: draft/open, head/base. Body deployment/test claims remain operator-reported, not independently executed in this review.

<a id="src-02"></a>
## SRC-02 — PR #12 current metadata
[PR #12 current metadata](https://github.com/davidelaverga/Sophia/pull/12)

Fresh connector metadata: open/draft, studio/qol over studio/precise. Older deployment prose is not used as current hosting truth.

<a id="src-03"></a>
## SRC-03 — New Sophia main branch
[New Sophia main branch](https://api.github.com/repos/davidelaverga/Sophia/branches/main)

Fresh read returned 01d9117bdcf9ec8ee18cd5414aa08ee4f24265a3.

<a id="src-04"></a>
## SRC-04 — Exact-head CI run187
[Exact-head CI run187](https://github.com/davidelaverga/Sophia/actions/runs/36281456865)

Fresh Actions read: completed/success at head2911b037; not a rerun or certification of a retargeted main candidate.

<a id="src-05"></a>
## SRC-05 — Existing OP-0009 release request
[Existing OP-0009 release request](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/docs/coordination/S1-05A/S1-05A-CC-0033.md)

Read in full. Candidate00a16c2, migration0017, Studio/media only, approval absent. Also checked latest issue14 comments ending at CC0033.

Git blob SHA: `be128d7bb7141b0074867e56820fd4ae037b38dc`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-06"></a>
## SRC-06 — Existing Claude–Codex development protocol
[Existing Claude–Codex development protocol](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/docs/alignment/2026-09-25/CLAUDE_CODEX_PROTOCOL.md)

Read in full. New protocol extends it for support tasks and per-mission coordination, retaining no-bypass, exact-source and public-data boundaries.

Git blob SHA: `f211d271bbd067dc4bea0be8bda4643481a4ec46`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-07"></a>
## SRC-07 — Old Sophia donor branch
[Old Sophia donor branch](https://api.github.com/repos/davidelaverga/Sophia-Agent/branches/codex/sophia-observability-v1)

Fresh branch read at 8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf. Runtime provider config not inspected.

<a id="src-08"></a>
## SRC-08 — Legacy example provider configuration
[Legacy example provider configuration](https://github.com/davidelaverga/Sophia-Agent/blob/8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf/config.example.yaml)

Read source lines130–290. Tavily search/Jina fetch selected in example; InfoQuest commented. config.yaml exact fetch returned404.

Git blob SHA: `b7b5ec473d2fd72eb80070290a9677cfc7ba7a95`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-09"></a>
## SRC-09 — Guarded search and budget delta
[Guarded search and budget delta](https://github.com/davidelaverga/Sophia-Agent/blob/8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf/backend/packages/harness/deerflow/sophia/tools/builder_web_search.py)

Full source: provider resolution, source/URL tracking, pre-call read-side budget with summed deltas, always-research guidance.

Git blob SHA: `7ff746dae6131fbe53f796c19e40a97690bb7512`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-10"></a>
## SRC-10 — Guarded exact-source fetch
[Guarded exact-source fetch](https://github.com/davidelaverga/Sophia-Agent/blob/8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf/backend/packages/harness/deerflow/sophia/tools/builder_web_fetch.py)

Full source: exact permitted URLs, configuration delegation, raw provider result; outer wrapper has no independent4096-character cap.

Git blob SHA: `6a275f41cceb4ee483fc71cfc29ab19f0e744247`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-11"></a>
## SRC-11 — Legacy Tavily search and extract
[Legacy Tavily search and extract](https://github.com/davidelaverga/Sophia-Agent/blob/8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf/backend/packages/harness/deerflow/community/tavily/tools.py)

Full source: normalized search, extract optional fetch, raw_content[:4096].

Git blob SHA: `de7996c7a48fee4903021dd3986b66c021f8dca1`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-12"></a>
## SRC-12 — Legacy Jina HTTP client
[Legacy Jina HTTP client](https://github.com/davidelaverga/Sophia-Agent/blob/8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf/backend/packages/harness/deerflow/community/jina_ai/jina_client.py)

Full source: Reader POST, optional JINA_API_KEY, X-Timeout header, no requests.post timeout parameter. Companion tool source linked below.

Git blob SHA: `3b1a219e3c7d2b51ee38d3996205ad742e7ff566`. A Git blob SHA is not the SHA-256 of a local file.

Also read [Jina tool/readability wrapper](https://github.com/davidelaverga/Sophia-Agent/blob/8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf/backend/packages/harness/deerflow/community/jina_ai/tools.py), blob `0bde35a6305467d26d969595f2e381a7dc0d5bc1`: HTML extraction → readability Markdown → `[:4096]`.

<a id="src-13"></a>
## SRC-13 — Legacy Firecrawl search/scrape
[Legacy Firecrawl search/scrape](https://github.com/davidelaverga/Sophia-Agent/blob/8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf/backend/packages/harness/deerflow/community/firecrawl/tools.py)

Full source: available alternative search and Markdown scrape, silent4096-character prefix.

Git blob SHA: `495c60c3d7371c2c3240713a94d45a3a565b15e2`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-14"></a>
## SRC-14 — Native web family inventory
[Native web family inventory](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/web/README.md)

Fresh full read: listed Exa, Perplexity, DeepSeek search plus direct HTTP. Tavily/Jina are not listed built-ins at this pin.

Git blob SHA: `22ef641e29c4626b2af40ed07a5d13b5cc0700c9`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-15"></a>
## SRC-15 — Native web service/registration
[Native web service/registration](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/web/web/src/index.ts)

Fresh complete supplied source: registerSearchProvider/registerFetchProvider, explicit missing/unavailable/ambiguous selection errors, forwarded AbortSignal.

Git blob SHA: `fe36c7a103fac70510d34128fc8f4d0c59168c0f`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-16"></a>
## SRC-16 — Current repository core schema
[Current repository core schema](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/db/migrations/0001_core.sql)

Read source lines1–200. Mission revisions/decisions/sources/commands/artifacts exist; core artifacts.format lacks Markdown. Later migration definitions must still be reconciled at implementation.

Git blob SHA: `e5ed59188f3d876c7a2b318fa10527ca26ad4584`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-17"></a>
## SRC-17 — Current private media action routes
[Current private media action routes](https://github.com/davidelaverga/Sophia/blob/2911b037c9703703f2ae33955123d434797e3155/apps/api/src/routes/media.ts)

Fresh source read: exact capability allowlist and /v1/media/tool-calls core. No wildcard private-route bypass.

Git blob SHA: `942ebabee7daa52ef40dade03c5868f885241639`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-18"></a>
## SRC-18 — Native web types/metadata requirements
[Native web types/metadata requirements](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/web/web/src/types.ts)

Fresh complete supplied source: optional search metadata; WebFetchResult mandatory final target URL and target HTTP status; html|text closed body union; provider usability and cancellation.

Git blob SHA: `9e94bac46bea8250f2dc9931802bfe5dde9e8030`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-19"></a>
## SRC-19 — Legacy URL and recipe budget policy
[Legacy URL and recipe budget policy](https://github.com/davidelaverga/Sophia-Agent/blob/8c5cf538419cbe3f6eabe59e196242dfb7a6f2cf/backend/packages/harness/deerflow/sophia/builder_web_policy.py)

Full source: whitespace/trailing punctuation normalization, always-enabled capability, research5search/8fetch versus other3/5.

Git blob SHA: `f3a06ebee5805349f202cc9e5592bc13325a42d2`. A Git blob SHA is not the SHA-256 of a local file.

<a id="src-20"></a>
## SRC-20 — Actual S1-05A coordination identity
[Actual S1-05A coordination identity](https://github.com/davidelaverga/Sophia/issues/14)

Fresh issue read and last comment page:95comments, latest CC0033 awaiting approval. Both agent sessions post through the same GitHub author, so author name alone is not human approval.

<a id="pub-01"></a>
## PUB-01 — Tavily Search API reference
[Tavily Search API reference](https://docs.tavily.com/documentation/api-reference/endpoint/search)

Current primary documentation consulted for structured Search options/results; no live call made.

<a id="pub-02"></a>
## PUB-02 — Tavily Extract API reference
[Tavily Extract API reference](https://docs.tavily.com/documentation/api-reference/endpoint/extract)

Current primary documentation orientation for optional extraction route; not implemented/tested here.

<a id="pub-03"></a>
## PUB-03 — Jina API dashboard
[Jina API dashboard](https://jina.ai/api-dashboard/)

Primary endpoint consulted; dynamically served page yielded limited extracted text. Exact integration still relies on qualified API response/SDK inspection, not assumptions from that page.

<a id="pub-04"></a>
## PUB-04 — Firecrawl Scrape documentation
[Firecrawl Scrape documentation](https://docs.firecrawl.dev/features/scrape)

Current primary orientation for optional alternative; no Firecrawl call made.

<a id="src-21"></a>
## SRC-21 — Native preset registry at the configured rc.1 source

[Preset registry README](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/preset/agent-preset-registry/README.md)

Fresh source read of the opening110lines reconfirmed declarative tools/prompt/skill presets, shared host loop, live-generation retention, current-definition restore after restart, and no sandbox guarantee. Git blob SHA: `44b01be1ceea5936668f091fb410137f3a139a88`. This supplements, rather than replaces, the prior audit's rc.1 preset finding.

## M01 content amendment — 28 September 2026

This content-only revision did not refresh the dated repository or provider observations above. It used the actual v1.0 mission and candidate assets, the preserved prior ledgers, and a full read of the original user skill `goal_lifecycle(2).md` (file ID `file_00000000ff0c820aa4b8f2e3736c2d07`). The exact wording and loading rules in [M01 v1.1](missions/M01_MISSION_COMPANION.md#8-exact-system-prompt-complete-skill-and-context-binding) are authored implementation requirements, not verified deployed behavior. See [content sources](evidence/m01_content_sources.json) and [the change record](CHANGELOG_v1.1.md).
