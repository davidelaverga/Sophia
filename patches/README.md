# patches/

Two kinds of patch live here. Neither is an upstream change or a fork.

- `t3code/`: **carried, not applied.** Reviewed diffs for the external T3 Code pin. No Sophia build, install or startup applies them; see [SOURCE_MAP §2o and §2p](../docs/SOURCE_MAP.md).
- `@earendil-works__pi-ai@0.87.1.patch` and `@deepseek-ai__dsh-llm-pi-ai@0.2.0-rc.2.patch`: **applied by Sophia.** `pnpm-workspace.yaml` names them under `patchedDependencies`, so every install of the lock applies them. That includes the frozen CI install and the runtime artifact (`pnpm deploy` of `@sophia/dsh-runtime`).
  - These two installed packages are **not** the official registry bytes. Their identity is the registry tarball plus the patch hash recorded in `pnpm-lock.yaml`.

## The applied pair (INC04-S03A-R07-C1P)

**Purpose.** A model call's usage reaches Sophia only when the provider actually reported it, completely, for that call. See [SOURCE_MAP §2q](../docs/SOURCE_MAP.md) and [the handoff](../docs/handoffs/INC04-S03A-R07-C1P.md).

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
| `@earendil-works__pi-ai@0.87.1.patch` | 6,278 | `fc9c52c812d9e32a3869d20832fdacc944312e7333a57a5eebcf9eba6fb92bc1` |
| `@deepseek-ai__dsh-llm-pi-ai@0.2.0-rc.2.patch` | 2,179 | `e61fcb0f763e32f571e01e85cf00c11ba2feaf8ff8f1a777aa7e4844e8c33147` |

**The patched files, full-file SHA-256.** The post-patch hash was read both from the installed workspace and from the locally deployed `.artifacts/runtime`; the two are identical.

| Package file | Pre-patch | Bytes | Post-patch | Bytes |
|---|---|---|---|---|
| pi-ai `dist/api/openai-responses-shared.js` | `7846279b34c2a569bda2b0753c8b083f8b976204b4fdd7586095ebbb6a643410` | 31,275 | `b77d222a1406e5b3b875aad2f451b2def4ba6da3a45d6e1a04104d046a540801` | 33,708 |
| pi-ai `dist/api/openai-responses.js` | `3e95145f94ac2a255d1adc0ae65cf02c2e6d479f7a2dbf5c466db21885c29ec6` | 13,439 | `98e3d4c79358add2fbdcc506f20b099e649ab5860478c6a384a5af910c894d9b` | 13,645 |
| pi-ai `dist/types.d.ts` | `5e08c1db4740b95b7107d3c3540a6d0e414a82d9c75fab950150827c994e14a3` | 43,528 | `ed396d3f7c3552db6a28f77986ab6d3d18a605671f4579e9f21b10850c1423d4` | 43,863 |
| dsh-llm-pi-ai `lib/index.js` | `d46dbc30aeb3414190000e6f8aeaaf994246b5e5c651de07639f4a7e92de37ef` | 114,010 | `fb1df48a21156976839740bdf358ccc4f6c128d70f4c9304ac10eee83ab0b26c` | 114,741 |

**Source maps.**

- The three pi-ai files' `//# sourceMappingURL` lines are replaced by a comment, so automatic stack mapping never presents the old maps as describing changed lines.
- The original `.js.map` and `.d.ts.map` files remain unreferenced and unchanged. They do carry `sourcesContent`; they were simply not regenerated.
- dsh-llm-pi-ai's `index.js` carries no source map reference.

**License.** Both packages are MIT. Their LICENSE files stay in the installed packages, unchanged. These patches are derivative changes under the same license, with copyright remaining with the upstream authors for their code.

**Re-evaluate on any pin change.**

- A version bump of either package (or of dsh, which pins dsh-llm-pi-ai) must re-author or retire its patch.
- pnpm refuses an install whose patch no longer applies, so a stale patch cannot apply silently.
- Both patches belong together: the reader keeps an unmarked openai-responses message unknown. A producer patch with an unpatched reader would emit pi-ai's default zeros again. One lock installs both.

**How they were made.**

- `pnpm patch <pkg>@<version> --edit-dir <dir>`, then a reviewed exact-match edit, then `pnpm patch-commit <dir>`, all with pnpm 11.7.0 on Node 24.21.0.
- Nothing in `node_modules` was edited by hand.
