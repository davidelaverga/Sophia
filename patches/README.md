# patches/

Two kinds of patch live here. Neither is an upstream change or a fork.

- `t3code/`: **carried, not applied.** Reviewed diffs for the external T3 Code pin. No Sophia build, install or startup applies them; see [SOURCE_MAP §2o and §2p](../docs/SOURCE_MAP.md).
- `@earendil-works__pi-ai@0.87.1.patch` and `@deepseek-ai__dsh-llm-pi-ai@0.2.0-rc.2.patch`: **applied by Sophia.** `pnpm-workspace.yaml` names them under `patchedDependencies`, so every install of the lock applies them. That includes the frozen CI install and the runtime artifact (`pnpm deploy` of `@sophia/dsh-runtime`).
  - These two installed packages are **not** the official registry bytes. Their identity is the registry tarball plus the patch hash recorded in `pnpm-lock.yaml`.

## The applied pair (INC04-S03A-R07-C1P, revised by INC04-R07-C2B-PRODUCER-001)

**Purpose.** A model call's usage reaches Sophia only when the provider actually reported it, completely, for that call. See [SOURCE_MAP §2q](../docs/SOURCE_MAP.md) and [the handoff](../docs/handoffs/INC04-S03A-R07-C1P.md).

The same two patches also carry the C2B observation producer described [below](#c2b-call-observation-inc04-r07-c2b-producer-001). There is no third patch.

**pi-ai, the producer.**

- It records a private `usageProvenance` on the assistant message: `complete`, `partial` or `absent`.
- The value is judged from that call's own terminal Responses `usage`.
- It also keeps usage reported on `response.failed`.

**dsh-llm-pi-ai, the reader.**

- On the `openai-responses` API it emits a `usage` chunk only for `complete`.
- An absent, partial or unrecognized marker on that API stays unknown. That includes a pi-ai without the producer patch.
- Every other API keeps its behavior.

| Package | Version | Registry integrity (unchanged) | Upstream | License |
|---|---|---|---|---|
| `@earendil-works/pi-ai` | 0.87.1 | `sha512-X/3PfQBnnoeVdO9Cv8zHghUMglzlgNZYGNzoPnbRoGnHl3Rw3TlA2UKSUB7BRHUOxMryHXYa8dnjWZlbRheDZA==` | `github.com/earendil-works/pi`, `packages/ai` | MIT |
| `@deepseek-ai/dsh-llm-pi-ai` | 0.2.0-rc.2 | `sha512-8DxCwQNhfQwqNQ6khxyDSh6Pba9PjpnNQqvAz29SF/V86ClZNH5xZuqCdNfU8E426Ec6wti5oUtM+uKohMAe3A==` | `github.com/deepseek-ai/deepseek-harness`, `packages/llm/llm-pi-ai` | MIT |

| Patch file | Bytes | SHA-256 (= the lock's `patch_hash`) |
|---|---|---|
| `@earendil-works__pi-ai@0.87.1.patch` | 16,233 | `21b71bedc00318f3558e8fb65413e8d51abf3f5a03f4f3bb09fb82baf97a49a3` |
| `@deepseek-ai__dsh-llm-pi-ai@0.2.0-rc.2.patch` | 10,584 | `96f9dbd5f0be3830450240a204663281159bbf5b90750c25f53138e679667c2c` |

The C1P-only predecessors were 6,278 B `fc9c52c8…` and 2,179 B `e61fcb0f…`. The C2B revision replaced both identities at every occurrence in `pnpm-lock.yaml`.

**R1 of the C2B revision** (C2B69-F01) changed only the pi-ai patch. Its earlier C2B identity was 14,359 B `81cfd171…`; only that `patch_hash` changed in the lock. The dsh-llm-pi-ai patch is unchanged.

**The patched files, full-file SHA-256.** The post-patch hash was read both from the installed workspace and from the locally deployed `.artifacts/runtime`; the two are identical.

| Package file | Pre-patch | Bytes | Post-patch | Bytes |
|---|---|---|---|---|
| pi-ai `dist/api/openai-responses-shared.js` | `7846279b34c2a569bda2b0753c8b083f8b976204b4fdd7586095ebbb6a643410` | 31,275 | `2c1df1886262f4e440003516ed2eada6e15185f0406c29dbf38ae32aa850cc1f` | 36,513 |
| pi-ai `dist/api/openai-responses.js` | `3e95145f94ac2a255d1adc0ae65cf02c2e6d479f7a2dbf5c466db21885c29ec6` | 13,439 | `495d187090dd57cbb9aa34b3942f3c21ac253a5492ac80c8c206cf267e6e5f64` | 16,488 |
| pi-ai `dist/types.d.ts` | `5e08c1db4740b95b7107d3c3540a6d0e414a82d9c75fab950150827c994e14a3` | 43,528 | `2af40a9503feca4fa6640d7640fac531a6b516f1e5b27c3bb9c842d1f6f9818b` | 44,369 |
| dsh-llm-pi-ai `lib/index.js` | `d46dbc30aeb3414190000e6f8aeaaf994246b5e5c651de07639f4a7e92de37ef` | 114,010 | `b7f7e5b9ae73cb584bf1ac44860cff068faaacd885827bc932ab3301caed4d27` | 120,998 |

The C1P-only post-patch hashes were `b77d222a…`, `98e3d4c7…`, `ed396d3f…` and `fb1df48a…`. Before R1, `openai-responses.js` was `130c355e…` (15,244 B); the other three files are unchanged by R1. The pre-patch column is the unchanged registry original.

**Source maps.**

- The three pi-ai files' `//# sourceMappingURL` lines are replaced by a comment, so automatic stack mapping never presents the old maps as describing changed lines.
- The original `.js.map` and `.d.ts.map` files remain unreferenced and unchanged. They do carry `sourcesContent`; they were simply not regenerated.
- dsh-llm-pi-ai's `index.js` carries no source map reference.

**License.** Both packages declare MIT. What each one ships differs, and neither patch adds, removes or changes a license file:

- `@earendil-works/pi-ai` 0.87.1 declares `"license": "MIT"` in its `package.json` (whose `files` are `dist` and `README.md`), and its README ends with a `## License` section reading `MIT`. It ships no LICENSE or NOTICE file: none exists in the registry original, the installed copy or the local `pnpm deploy` runtime.
- `@deepseek-ai/dsh-llm-pi-ai` 0.2.0-rc.2 declares `"license": "MIT"` and ships its MIT `LICENSE` (1,065 bytes, SHA-256 `ebb4f09972aee8608be255debaf78451a68e95c290f55c240dec2ecfa16ea6be`), unchanged in the installed and deployed copies.

These patches are derivative changes under the same license, with copyright remaining with the upstream authors for their code.

**Re-evaluate on any pin change.**

- A version bump of either package (or of dsh, which pins dsh-llm-pi-ai) must re-author or retire its patch.
- pnpm refuses an install whose patch no longer applies, so a stale patch cannot apply silently.
- Both patches belong together: the reader keeps an unmarked openai-responses message unknown. A producer patch with an unpatched reader would emit pi-ai's default zeros again. One lock installs both.

**How they were made.**

- `pnpm patch <pkg>@<version> --edit-dir <dir>`, then a reviewed exact-match edit, then `pnpm patch-commit <dir>`, all with pnpm 11.7.0 on Node 24.21.0.
- The C2B revision used the same workflow: each edit directory started from the C1P-patched package, so each new patch is the whole C1P change plus the C2B change.
- Nothing in `node_modules` was edited by hand.

## C2B call observation (INC04-R07-C2B-PRODUCER-001)

**Purpose.** For a reservation that opted in with `facts: "observed_v1"`, Sophia settles the A58 `evidence.observed` facts on the original call ledger. The facts must have actually crossed from the provider call to Sophia. See [SOURCE_MAP §2u](../docs/SOURCE_MAP.md) and [the handoff](../docs/handoffs/INC04-R07-C2B-PRODUCER-001.md).

**pi-ai, the producer.**

- Only when a caller passes `callObservation: true`, the `openai-responses` call records a private, non-enumerable `sophiaC2bObservation` record on its output message:
  - the transport status and `x-request-id` (N2, from the header);
  - the typed status and request id of the SDK's own HTTP rejection of the request (see below);
  - the `response.created` id (N1);
  - the first provider terminal (`completed`, `incomplete`, `failed` or `error`), with that terminal's own id and raw `input_tokens`, `cached_tokens` and `output_tokens`.
- Without the option, nothing is recorded and the output is unchanged.

**The typed-error boundary (R1, C2B69-F01).** A typed HTTP fact is recorded only in a scope around exactly the awaited request (`retryProviderRequest(… client.responses.create(…).withResponse() …)`), and only from the SDK's own carrier: `OpenAI.APIError` with a numeric `status`, read as own data properties. Nothing is recorded from:

- client or parameter construction;
- `onPayload`, which runs before the request;
- `onResponse`, which runs after the headers;
- the stream;
- a local ending check;
- any other error class.

A local error there, even one shaped like or made as an `APIError`, adds no status and no N2. The error itself is rethrown unchanged, so error handling and C1P are as before. Sophia's adapter forwards neither callback; this boundary holds for any caller of the public `stream`.

**dsh-llm-pi-ai, the reader.**

- It sets that option only on the `openai-responses` API, and only when the cordis capability `sophiaC2bObservation` resolves at call time with the exact version `sophia-c2b-observation-v1`.
- Only then does it interleave up to three `x-sophia-c2b-observation` frames into the generic `llm/stream`:
  - F1, the transport facts, just before the first delivered progress event after the headers;
  - F2, the first supported created N1, just before the next delivered progress event (`response.created` itself emits no pi-ai event);
  - F3, everything the producer recorded, just before the `done` or `error` event. That includes the transport facts, so a call that ends before any progress event still carries them.
- Each frame's payload sits under a non-enumerable, non-writable, frozen own property, so `JSON.stringify` of a frame is only its `type`.
- Every other API, a missing capability, or a capability with another version keeps today's chunk stream byte for byte.
- Each frame crosses at most once, in that order, and nothing crosses after F3. A frame is produced only when the consumer pulls the next chunk, so nothing crosses after a consumer return. The adapter never drains or reads on to reach a frame.

**Sophia's side.** Sophia's bridge provides the capability only after its prepended `llm/stream` listener is installed, and only when some route qualifies on the actual loaded runtime. It withdraws the capability before that listener is removed. Every Sophia path strips the frames before any generic consumer sees them.

**Pairing.** Both patches still belong together. A C2B producer with an unpatched reader is never asked to record. A C2B reader with an unpatched producer finds no record and sends no frame, so the call settles with nothing delivered (`no_frame_delivered`).
