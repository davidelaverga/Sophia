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

## 3. INC04-S03A-R07-C1P-R1-001: ACK and plan (appended before any other R1 edit)

Everything above this heading is unchanged from `d9963bbf`, including "The ONE ordinary `pnpm check` is pending", which was true when it was written. Section 3 records what happened next. It does not rewrite that history.

**Base.** R1 is a new, normal, signed sole child of exact `d9963bbfd10c2051d2e21a9069b7eac38be56d1c` (tree `f6d02163c591e4fda810d914bd7c42f742f29825`), on its own branch and worktree `inc04-s03a-r07-c1p-r1-001`. d996, its one failed ordinary and every packet stay as they are.

**Starting blobs, verified at d996.** All three match.

| Path | Starting blob |
|---|---|
| `tests/integration/research-route.test.mjs` | `04b002cc5cd67e6b4136a2d61d3bc8cfae988f30` |
| `patches/README.md` | `fd9f6fa70a43148fd69efe7be8350a0e2532bed0` |
| `docs/handoffs/INC04-S03A-R07-C1P.md` (this file, append only) | `1ae6cba02a9f30f57c6e10b13fa7cd14e8c793a2` |

**Root decision, acknowledged.**

- D-C1P-1 stays for the inspected Responses route. A positive `cache_write_tokens` is an unqualified extension under the pinned contract.
- The old fixture's "live expected from turn 2" comment is not provider or owner qualification, and neither is pi-ai's existing arithmetic.
- No production guard, dependency patch or C1P test expectation is relaxed to satisfy the older fixture.

**Plan.**

1. **Test, `research-route.test.mjs`.**
   - Keep every route, provider, model, reasoning, tool, `strict`, cache-key, no-retention, `store: false`, 16000-cap, stable-prefix, session-identity and foreign-route-refusal assertion, and the real runtime crossing.
   - The second turn becomes a genuine cache hit: input 1500, cached 1200, output 20, no write extension. It is expected as disjoint `300, 20, 1200, undefined`. The first turn's 1/1 stays.
   - A separate, paired adverse control on the same route: the same base counts plus `cache_write_tokens: 100`, labelled an unqualified synthetic extension. Its usage must stay unreported (no counts, never zero-filled).
   - Remove the unsupported "live expected" wording.
2. **`patches/README.md`.** Correct the blanket LICENSE sentence from FINAL E04.
3. **This handoff.** Append the failed d996 ordinary, the cause, the root decision, the R1 candidate and its checks, and the E01–E04 precisions.

No dependency patch, lock, workspace, runtime config, mock, SOURCE_MAP, SQL, GEN or production path changes. No `artifacts:record`.

## 4. What happened to d996's ordinary, and the R1 repair (appended)

### 4.1 The ONE ordinary on d996 FAILED

`pnpm check` on exact clean `d9963bbf` (tree `f6d02163`), with the owned PG16 on 55519, ran 01:49:19Z to 02:07:06Z and **exited 1**. It was run once and not rerun.

Every stage before integration passed: toolchain, format, lint, build, typecheck, contracts, unit, and `pnpm artifacts` with every identity matching.

| Phase | Tests | Pass | Fail | TEST skips | Whole-SUITE skips |
|---|---|---|---|---|---|
| `pnpm test` | 5305 | 5238 | 0 | 67 (66 no headless shell, 1 "root reads every file") | 4 (LiveKit, URL not set) |
| `pnpm test:integration` | 216 | 213 | **1** | 2 (log-compat export/import, env not set) | 2 (design-capture and render-supervisor crossings, no headless shell) |

`*.db.test.ts` and `*.live.test.ts` files are outside `pnpm check`'s own globs (a profile omission, not a skip).

**The one failure: scope and cause.** It was `tests/integration/research-route.test.mjs:64`, a file outside C1P's lease and unchanged since af82.

- Its second turn scripted a synthetic `cache_write_tokens: 100` and expected it to be reported as `[200, 20, 1200, 100]`.
- Under D-C1P-1 that positive extension makes the call's usage partial, so d996 reported `[null, null, undefined, undefined]`.
- The failure was deterministic, not flakiness or environment. The first, complete turn still passed.
- C1P's author had not included this file among the positive controls; the full integration suite first ran in the ordinary.

**Root decision (R1).** Keep D-C1P-1.

- The fixture's "live route is expected to from turn 2" comment is not provider or owner qualification, and pi-ai's old arithmetic is not either.
- Repair the fixture in a new child. Production, the dependency patches and C1P's own tests stay as they are.
- Full R07, live billing and cache-write qualification stay open.

### 4.2 Precisions to the d996 EARLY/FINAL packets (additive; the packets stay byte-for-byte)

- **E01.** The two executed work-in-progress trees, `66abef77` (focused crossings and positive controls) and `9b952a60` (static checks), were exported from the real objects as full `ls-tree -rz` listings. Root reconstructed both tree IDs from the rows independently. They differ from d996 only in documentation: `SOURCE_MAP.md`, this handoff and `patches/README.md`, and for `9b952a60` only this handoff.
- **E02.** Log `23` is an offline install of the work-in-progress tree. It printed a deprecation WARN and "Already up to date". It is not an archived before/after reproduction of the base lock.
  - Lock semantics hold: resolution, integrity, version and tarball lines, and every key, are identical once the patch_hash suffix is stripped.
  - The `@smithy/core@3.35.0` `deprecated:` note is package-manager metadata.
- **E03.** The fail-before at af82 (log `43`) did not settle every case at zero.
  - Missing, failed, cut, 500 and mid-stream Stop settled at cost 0.
  - The partial-invalid reports settled at varied nonzero costs, up to the capped 1000 for an unsafe integer.
  - A failed response's reported 7/3 was replaced by 0/0.
  - The partial installation settled at 1/1.
  - §2.3's summary "settled 0 for missing, partial, …" is imprecise for the partial cases.
- **E04.** The sentence "Their LICENSE files stay in the installed packages" in `patches/README.md` was false for pi-ai, which ships no LICENSE or NOTICE file. R1 corrects it (§4.3).

### 4.3 The R1 candidate: three paths, a child of d996

**`tests/integration/research-route.test.mjs`.** Every existing route assertion stays, on the real runtime crossing:

- endpoint, key reference, model, medium reasoning and `include`;
- the cache key, no retention or options, the 16000 cap and `store: false`;
- the role's tools and `strict: false`;
- the stable instruction and tool prefixes, two requests, the attempt identity, and the foreign-route refusal.

What changes:

- **The second turn is a genuine cache hit.** It is input 1500 with 1200 cached and output 20, with no write extension. It is expected as `[300, 20, 1200, undefined]`, and turn 1 stays at 1/1.
- **Each call's settle is now asserted.** Both are `settled`, with usage and with cost computed from the route's prices, cache read included.
- **New paired adverse control.** On the same route, turn 1 is complete (settled, priced). Turn 2 adds a labelled synthetic `cache_write_tokens: 100` on top of the same counts. It must:
  - report no counts;
  - settle `uncertain`, with neither `costUsd` nor `usage` (not even zeros);
  - use two distinct reservations.

  Because the complete turn sits in the same session, refusing every usage cannot pass.
- **Comments.** The unsupported "live expected" comment is removed. The header states that usage is synthetic, that the service is the labelled fixture (these tests see the settle request, not a database reservation), and that the PostgreSQL consequence is crossed in `usage-provenance.test.mjs`.

**`patches/README.md`.** The license paragraph now records what each package actually ships:

| Package | License declaration | License file |
|---|---|---|
| pi-ai | MIT, in `package.json` and its README | none shipped |
| dsh-llm-pi-ai | MIT | its `LICENSE`, 1,065 B, `ebb4f099…` |

Nothing else in the file changes.

**This handoff.** It is append-only. §1–§2 above are byte-identical to d996.

### 4.4 R1 checks (before commit; the ONE R1 ordinary is pending)

**Setup.**

- Node 24.21.0 and pnpm 11.7.0, a frozen offline install with umask 022.
- A fresh owned PG16 on 55523 (new directory, free-port census first). 55519 and Routing's 55521 were not touched.

**`pnpm artifacts`.** Every identity matches d996's record (runtime `c97621b4…`, lock `7a500c03…`, bundle `cab29744…`, profile lock); no record was written.

| Run | Result |
|---|---|
| `research-route.test.mjs` (whole file, owned PG) | 3/3 pass |
| `usage-provenance.test.mjs` (unchanged, whole file, owned PG) | 29/29 pass, including the partial installation and the PostgreSQL conversation cases |
| `format:check`, `lint`, `typecheck`, `contracts:check` | all exit 0 |
| **Discrimination control (not an R1 fail-before)**: the new `research-route.test.mjs` on a clean af82 export, whose runtime has no C1P patches | 2 pass, 1 fail: the adverse control, which saw the legacy `[200, 20, 1200, 100]` accepted. Its paired positive and the refusal pass there too. |

No production byte changed in R1, so no semantic fail-before is claimed for it. The causal evidence for this repair is d996's failed ordinary (§4.1).

**Still open:**

- full R07, C2A–C6 and every AC-04 case;
- live billing and cache-write qualification;
- the af82 CLI P2, whose repair is the separate e62 candidate;
- RTA, the native owner, the deployed app, and the Personal9e hold.
