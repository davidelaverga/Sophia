# INC04-S03A-R07-C1P: producer-level usage truth (local candidate)

## 1. ACK and plan (recorded before any other edit)

**Author.** SAME Native1. I am not the independent reviewer.

**Task and context.**

- Task `05839bcd…f151`; context zip `b8103735…c216`, all 5 manifest members verified.
- B1 EARLY `06fe0903…03b0`: 26 SUMS verified, scripts treated as inert.
- Its bundle verified with the single prerequisite 030.
- af82 was absent locally. It was taken by ONE local-file fetch (`--no-write-fetch-head --no-tags`) into the new private ref `refs/intake/inc04-s03a-r07-c1p-001/af82`.
  - Refs went from 71 to 72.
  - FETCH_HEAD, the main index and the 39 worktrees are unchanged.

**Base.** Exact `af82d575c7746f5605fc7754a27e5816be020225`, tree `b588c6a5d6c087468b9bbcb5cc73ea1a2e7ac537`, parent 030.

- Worked in the new worktree `/tmp/sophia-s03a-public-src/inc04-s03a-r07-c1p-001` on branch `inc04-s03a-r07-c1p-001`, clean at the start.
- All 12 starting blobs match the allocation: `pnpm-workspace.yaml` `375d5a93`, `pnpm-lock.yaml` `f1a5bdc3`, `config/runtime-unit.json` `788ca257`, `config/dsh/profile/pnpm-lock.yaml` `f0875f81`, `tests/support/mock-responses.mjs` `300b1301`, `tests/support/mock-responses.d.mts` `a14f8efc`, `docs/SOURCE_MAP.md` `d4e853cd` (af82; §2p is B1's carried patch), and five paths absent.

**Lease.** Exactly these 12 paths. No migration, amendment or GEN. Routing B2's 20 paths (0108, `INC04-S03.md`) are untouched.

**Root decisions applied.**

- **Producer.** pi-ai@0.87.1 records a private `usageProvenance` (`complete | partial | absent`) from this call's raw terminal Responses data:
  - it starts at `absent`;
  - every `finalizeResponse` sets it from that response alone, so nothing is borrowed from earlier data;
  - `response.failed` with usage is now mapped too.
- **D-C1P-1.** `input_tokens`, `output_tokens` and `input_tokens_details.cached_tokens` must each be an explicit, finite, non-negative safe integer, with `cached ≤ input`; otherwise the usage is `partial`. `cache_write_tokens` absent, or a valid 0, is complete with no extra class. A positive or invalid `cache_write_tokens` is `partial` (an unqualified extension). Total and reasoning counts are informational.
- **D-C1P-2.** Partial or absent usage is never complete `TokenUsage`, and is never zero-filled.
- **Reader.** dsh-llm-pi-ai@0.2.0-rc.2 emits usage on `done` and `error` **only** when `message.api === 'openai-responses'` and the provenance is exactly `complete`.
  - An absent or unrecognized marker on that API emits nothing; it stays unknown.
  - Other APIs keep their legacy behavior, based on the API, not on the marker's absence.
- **Integration.** Via pnpm 11.7.0 `pnpm patch` / `patch-commit` / `patchedDependencies`, with no version, pin or integrity change.
  - Stale `sourceMappingURL` references are removed from the modified files. The original map files stay, unreferenced.
  - Artifacts are rerecorded. The stale `darwin-arm64` digest is removed from config and kept here as history.
- **Sophia wrappers and the collector are unchanged.**

**Plan.**

1. A frozen base install under umask 022, then build the base runtime artifact.
2. Write the mock variants and `usage-provenance.test.mjs`, then the causal fail-before on the unpatched base runtime.
3. Author the patches with `pnpm patch`, then `patch-commit`.
4. A frozen reproduction, then `artifacts:record` and `artifacts`.
5. The focused crossings, then the static checks.
6. SOURCE_MAP §2q, `patches/README.md`, and this handoff.
7. One signed commit, then EARLY.
8. Own PG16 on 55519, the ONE ordinary `pnpm check`, cleanup, FINAL, HOLD.

## 2. Results (before commit; the ordinary is pending)

### 2.1 The producer fix

**How the patches were made.**

- `pnpm patch` / `patch-commit` with pnpm 11.7.0 on Node 24.21.0, umask 022.
- The edits were applied by two reviewed exact-match scripts, hashed in the EARLY packet.
- Nothing in `node_modules` was edited by hand.

**pi-ai@0.87.1.** `responsesUsageProvenance(usage)` is applied to each terminal Responses `usage`:

- in `finalizeResponse`, for completed and incomplete responses;
- in `response.failed`, which now also maps reported complete usage;
- the output starts with `usageProvenance: "absent"`.

**dsh-llm-pi-ai@0.2.0-rc.2.** `reportedUsage(message)`: on `openai-responses`, usage is reported only for `complete`; other APIs use the legacy `mapUsage`.

**Sophia source.** Unchanged: wrappers, the reply collector, the service, SQL, contracts and the bundle.

**Every priced Sophia route** (research, source review, conversation) and the dev `openai` route use `api: openai-responses` (bundle `cordis.patch.yml`). No other API is newly qualified.

**Retries are unchanged and not broadened.**

- pi-ai's SDK request uses `maxRetries: 0` (`openai-responses.js:117-124`).
- `retryProviderRequest` runs with dsh-llm-pi-ai's `maxRetries: 0` (SOURCE_MAP CON-B2-NO-RETRY).
- `llm-retry` is agent-level, and no research, review or conversation provider has a `retryPolicy`.
- Each attempt is its own reservation and settlement, and the cumulative allowance is unchanged.

### 2.2 Lock and runtime identity (actually executed)

**Lock.** `pnpm-lock.yaml` gains `patchedDependencies` (the two patch hashes, each equal to its patch file's SHA-256) and the patched snapshot identities. No version, integrity or pin changed.

**One registry deprecation note.** pnpm's resolution also wrote a `deprecated:` note on `@smithy/core@3.35.0`: "a bug in custom logger data redaction … rotate any credentials" (aws-sdk-js-v3#8393).

- It is registry metadata, not a resolution change.
- An offline relock from the base lock reproduced it byte-identically (logs `22`, `23`), so it is kept as pnpm's own output and not edited.
- That transitive dependency is not changed here. **Root should know about it.**

**`pnpm artifacts:record`** (log `30`) changed exactly these facts:

| Fact | Before | After |
|---|---|---|
| `dsh.artifacts_by_platform.linux-x64` | digest `bff106c3…872a` | digest `c97621b4…1f14` (entries 27747) |
| `dsh.artifact_digest` (primary linux-x64) | `bff106c3…872a` | `c97621b4…1f14` |
| `workspace_lock_sha256` | `6614784d…4a56` | `7a500c03…ee2` |

- `dsh.release_integrity`, all `sophia_bundle.*` facts and `config/dsh/profile/pnpm-lock.yaml` are **unchanged**, because the bundle source is unchanged.
- `pnpm artifacts` (log `31`) then matched every fact.

**The deployed runtime** contains only the patched pi-ai and dsh-llm-pi-ai (zero unpatched copies). All four patched files there equal the installed post-patch hashes (`patches/README.md`).

**Stale darwin-arm64 entry.** The recorded `darwin-arm64` digest `sophia-tree-v2:sha256:4f6f256bbe4ae68be366372af5e0de8d4b99e3a21f13d9115a1b0e5fecd58a4a` (28427 entries) described the old, unpatched closure and could not be reproduced here (no darwin-arm64 host). It is **removed** from `config/runtime-unit.json` and kept here as history. The darwin-arm64 qualification of the patched closure is **open**. No platform pass is claimed beyond the reproduced linux-x64.

**Source maps.** The three modified pi-ai files no longer reference their maps. The original maps (which have `sourcesContent`) stay unchanged and unreferenced. dsh-llm-pi-ai has no map reference.

### 2.3 Real-adapter crossings: `tests/integration/usage-provenance.test.mjs`

**Setup.** The local `.artifacts/runtime`, the Responses test double on each route's own alias, a dummy key and fixture service. For conversation: the real API, worker and owned PG16 on 55519.

**The research matrix:**

| Case | Expected |
|---|---|
| Full usage | settled at cost |
| **Explicit zeros** | **settled 0**; observation counts 0/0 |
| **Completed without usage** | **uncertain**; observation counts null/null |
| Partial usage (missing `cached_tokens`, `cached > input`, unsafe integer, fraction, negative, missing `output_tokens`, positive `cache_write_tokens`) | uncertain |
| `cache_write_tokens` 0 | settled |
| Failed with usage | settled at it |
| Failed without usage | uncertain |
| Incomplete with usage | settled |
| Cut after `created` | uncertain |
| HTTP 500 | uncertain |
| Stop before the terminal event | uncertain |
| Stop after terminal usage | settled at it |

**Other routes, missing vs explicit zeros:** design (`meteredDesign`), source review and conversation (reply reservation `uncertain` vs `settled`, 0 tokens).

**A partial installation:** the runtime copy with the pi-ai patch reversed and the adapter as installed, given complete provider usage, settles **uncertain**: never legacy usage or zero.

**Wrapper contract** (unchanged code, not producer acceptance): a consumer return or throw after the usage chunk keeps `settled`; before it, `uncertain`.

**Results:**

| Run | Where | Result |
|---|---|---|
| **Fail-before**, final test bytes | Clean `git archive` export of af82 (base lock, base runtime reproduced with every fact matching, logs `40`–`42`), log `43` | **29 tests: 12 pass, 17 fail, all `ERR_ASSERTION`, 0 module/syntax/type errors**. The wrong settlements: settled 0 for missing, partial, failed, cut, 500 and mid-abort; failed-with-usage discarded; partial installation settled. |
| Earlier fail-before, 28 tests before the partial-installation case was added | Worktree, log `11` | 16 semantic failures |
| **After**, same bytes | Patched worktree runtime, log `34` | **29/29 pass** |

**Existing positive controls** on the patched runtime (log `35`, 72/72): research-tools, review-tools, design-tools, request-shape, and the design-meter and reply-plugin units.

### 2.4 Static checks

`format:check`, `lint`, full `typecheck` and `contracts:check` all exit 0 (logs `51`–`54`). No SQL, migration, amendment, GEN, Studio or workflow path is touched.

### 2.5 Not claimed

- Live provider behavior (Q5), provider-billed amounts, account or route qualification.
- Full R07, C2–C6 and every AC-04 case.
- That a pre-terminal abort's real consumption is known. It stays uncertain by design.
- Any darwin-arm64 closure.

**The ONE ordinary `pnpm check` is pending.**
