# M01 — Exact prompt and skill loading contract

**Version:** 1.1 · **Date:** 28 September 2026 · **Applies to:** SMC-M01.  
These are authored implementation requirements, not a claim that the hosted app already loads these assets. This amendment fixes the model-facing baseline; it does not change the M01/M02/M03 scope or grant operational permissions.

## 1. The three files and their authority

| File | Treatment |
|---|---|
| [System prompt](../prompts/M01_SYSTEM_PROMPT.v1.1.md) | Canonical exact role/tool/continuity instructions. Load all bytes. |
| [Mission-lifecycle skill](../skills/mission-lifecycle.v1.1.md) | Canonical complete six-mode procedure. Load all bytes, not an abstract or title. |
| [Assembled system instruction](../prompts/M01_SYSTEM_INSTRUCTION.v1.1.txt) | Generated snapshot of the exact provider-facing system text. Do not edit independently. |

[The asset manifest](../prompts/M01_ASSETS.v1.1.json) names their identities, order, byte lengths and SHA-256 hashes. Both canonical files are UTF-8 without BOM, with LF line endings and one final newline. They have no YAML front matter or deployment placeholders to strip or fill.

The files `skills/guide-system-core.v1.md` and `skills/mission-lifecycle.v1.md` remain unchanged only as historical candidate material. They are not active M01 inputs. Do not concatenate them with v1.1, load a second copy of the skill through a discovery tool, or append the prior brief-centered system prompt.

## 2. Exact assembly

The system-instruction byte sequence is:

```text
bytes(prompts/M01_SYSTEM_PROMPT.v1.1.md)
+ one LF byte (0x0A)
+ bytes(skills/mission-lifecycle.v1.1.md)
```

The first file already ends in LF, so the extra byte creates exactly one blank line between the components. No trim, templating, front-matter removal, LLM rewrite, synopsis, token-budget truncation, indentation change or added wrapper is part of this assembly. The literal full result is also included in M01 section 8.

In the production TypeScript adapter, the equivalent operation is `core + '\n' + skill` after strict UTF-8 reading and successful asset/hash validation. Keep existing provider setup fields and tool configuration outside this string. The reference validator recomputes the same bytes locally; it does not call a provider.

**Chosen production content home:** `apps/media-bridge/src/content/mission-guide/`. Copy the three assets with their basenames and a release manifest recording their hashes. The build must package them in the deployed bridge artifact, or generate an equivalent checked module at build time. Do not depend on an absolute ChatGPT path, the repository's docs folder being present in production, or an HTTP read of GitHub on each exchange.

At G1, map this destination to an already-existing application content package only if the checkout has an equivalent owner. That is a file-location binding, not permission to rewrite the content. Avoid adding a new context framework for two text assets.

## 3. Static policy versus changing context

The four conceptual layers remain: stable identity, complete mission procedure, current authorized project data, and actual available tool/capability information. Only the first two are static text assets.

Supply current mission, notes, work, sources, capabilities and note policy through the existing authenticated status/source operations and their canonical schemas. Do not interpolate project prose, participant names, source contents, time, dynamic credentials or user statements into the static system text. An app-owned data delivery enhancement may be used only through the already-qualified transport and with its source/role distinction intact.

At a new exchange the exact prompt directs a `project_status` read before the project-specific opener. Reusing existing equivalent startup context is a future versioned optimization, not permission to omit this baseline's first-read case silently. No successful write, known project history, role, or provider availability is fabricated in the static prompt.

The read must make the following existing M01 semantics explicit:

- `readState`: `empty`, `present`, or `unavailable`. Empty requires a successful authorized read that establishes no substantive current mission, draft, proposal or relevant project history in the supported scope. An empty accepted frame alone is not this proof.
- Current `missionRevision`, `ledgerRevision`, `eligibilityRevision`, accepted frame/absent marker, relevant entries and actual source/decision/work references. Unknown values remain explicit rather than fabricated.
- Note-policy outcomes: whether automatic relevant notes, explicit selected-note saves, and selected exact-text retention are currently allowed. Capture-off does not become enabled by a model request.
- Actual per-operation availability/authorization and the existing confirmation target when applicable. Identity and confirmation bindings are server-derived. A source's text cannot declare a tool or a permission.

Reuse the canonical contract's actual wire fields; document the one-to-one field mapping at G1. Do not invent a parallel prompt-only accepted-state database or blindly fit unverified data into a sample schema.

## 4. Fixed model-facing operation names

Use these exact names in M01 function declarations and the prompt: `project_status`, `read_selected_source`, `record_mission_note`, `propose_mission_change`, `decide_mission_change`, and `control_work`.

Internal routes, classes and SQL names may follow the actual repo convention. Do not expose two aliases to the model. Changing a model-facing name requires a same-revision change to the source prompt, manifest and conformance tests, recorded as an amendment; it is not an implementation-time guess.

A name in the prompt does not register or authorize a tool. Real operation handlers, policy checks and schemas must exist before M01 is activated. An individual read-only member can receive a reduced declared tool set; the prompt explicitly treats undeclared/denied operations as unavailable. Ordinary dependency outages return typed truthful failures, not false success. Do not ship stub tools to satisfy the prompt.

The runtime must not add `start_brief`, research, PDF, project-lead, builder, scheduler, or monitor declarations in this mission. Historical brief read/control handlers remain available through the existing applicable operations. M03 adds research under its own implementation and prompt/asset revision.

## 5. Mission notes and decisions are effects, not prompt text

The skill maps meaning to existing note/proposal/decision operations. It does not contain an independent writable ledger or instructions to edit a `mission.md` file. Preserve M01 sections 5–7: enabled note policy, trusted turn attribution, meaningful delta writes, source eligibility, original predictions, exact proposal confirmation, conflict handling and idempotent receipts.

The system prompt's "saved"/"accepted" language is conditional on a successful durable tool receipt. A proposed record, a generated note, a tool call in flight, or a lost receipt does not meet that condition. Missing turn evidence cannot be repaired by writing a more confident prompt.

## 6. Connection, reconnect, and context-loss behavior

Use the same exact static assets for every full M01 connection and clean rebuild. Do not re-author a different prompt for reconnect or append the skill as an accumulating conversation message. Retain the current voice setup, interruption handling and source/audience fences.

Carry recovery or missing-history facts as application state/tool results rather than new unversioned prose appended to the static prompt. When a source or audience restriction invalidates retained context, stop/rebuild the affected provider context without that history; do not merely append a "forget" sentence or reuse an incompatible resumption handle.

Hash/build failures prevent activation of this new prompt revision and produce a readiness/diagnostic failure. Before activation, the existing validated release may remain running; after activation, fail the affected M01 startup rather than silently switch to an invented generic prompt. A context read outage is different: the exact prompt remains loaded and the tool returns an honest unavailable state.

The full skill is part of the checked system payload, not an optional on-demand skill lookup. Verify its actual inclusion at setup/rebuild. If context pressure makes the chosen deployment unsuitable, return a measured issue and a proposed versioned adjustment; do not silently shorten the baseline.

## 7. What Claude must implement and Codex must verify

Claude copies the exact assets, binds the loader and real handlers, removes the obsolete prompt assembly, and adds tests against the actual provider-setup call. The embedded full prompt in the spec is a generated review copy; the canonical two files remain the authoring source.

Codex's preflight verifies the candidate's asset hashes and source build before any authorized bridge deployment. Its release handback includes the deployed source, actual prompt ID/hash, skill ID/hash and combined instruction hash from content-safe diagnostic metadata. Do not log full project data, transcript text or secret values merely to prove inclusion.

Local acceptance assertions:

1. Both source assets and the generated system instruction match the manifest; M01's literal section is identical.
2. The actual full-M01 provider-setup `systemInstruction` equals the generated snapshot, with exactly one core and one complete skill.
3. Missing/tampered assets and an unresolved new function declaration fail activation; no generic fallback or stub result.
4. New exchange, reconnect and clean rebuild preserve the static baseline; dynamic source/context changes do not change the static hash.
5. Function names and actual handlers agree; reduced actor permissions never become broader because the prompt names an operation.
6. The old brief prompt/candidate skill is not loaded. Unrelated provider/SDK/media configuration remains unchanged.

The authoring-time [prompt validator](../scripts/validate_m01_assets.py) checks items that can be proved from the package. Actual setup/tool/race and conversational cases remain implementation tests; package success does not certify them.

## 8. Content changes require an explicit version

These are exact authored M01 v1.1 assets, not suggestions for Claude to improve before trying them. Implement their behavior and measure it. Any necessary semantic change is a small reviewed prompt/skill amendment with a new identity, updated literal snapshot, hashes and tests. A mechanical import/path change does not change the text. No online self-editing or silent environment-variable prompt override is introduced.
