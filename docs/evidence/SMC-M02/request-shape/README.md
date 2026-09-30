# SMC-M02 R1: request-shape parity of the gpt-6-luna route

**Observed 2026-09-30 on linux-x64 (Node 24.21.0, pnpm 11.7.0)**, keylessly, against a local Responses stub (`tests/support/mock-responses.mjs`). No provider was called and no credential was used: the key is the literal `sk-sophia-request-shape-dummy`, masked in the files here.

| File | What it is |
|---|---|
| [previous-unit.json](previous-unit.json) | `sophia-runtime-s1-03-dev` (dsh 0.1.7-rc.1, pi-ai 0.85.1), run from `acfa348`: route shapes of the episode's 3 requests, plus a sha256 and length for every model-facing text |
| [candidate-unit.json](candidate-unit.json) | `sophia-runtime-m02-dev` (dsh 0.2.0-rc.2, pi-ai 0.87.1) with the committed bundle patch: the same |

## Method

`tests/integration/request-shape.test.mjs` runs the unit's own `llm-pi-ai` config. That is the bundle patch's `openai` route with only a `baseURL` added in a test overlay; `agent-default-model` is untouched, so openai / gpt-6-luna / high. The episode is fixed:
1. a `sophia-research-v1` turn (10 tools) whose first answer calls `glob`;
2. a steer arriving while that call streams;
3. a second answer, then a second turn.

Every answer carries a reasoning item, so replay is exercised. `tests/support/request-shape.mjs` keeps every route-decided field verbatim and masks only the text dsh authors. The test compares each request with `tests/support/request-shape.expected.json`, which was recorded from the previous unit by the same test.

## Result

**Before the pin**, with the bundle's route unchanged from the previous unit, one route-level difference: every tool carried `strict: false` at E, where A sent no `strict` field. The cause: pi-ai 0.87.1 ships `openai/gpt-6-luna` with `compat.supportsStrictMode: true`; dsh lays the declared entry over it (`resolveEntry`), and pi-ai then writes `strict` on every function tool.

**Neutralized by explicit config.** `compat: { supportsStrictMode: false }` in the Sophia `models` entry is one of the four Responses compat switches dsh offers to a route. After it, the three route shapes are **identical**:

| Field | Previous and candidate unit |
|---|---|
| `model`, `stream`, `store` | `gpt-6-luna`, `true`, `false` |
| `max_output_tokens` | 128000 |
| `reasoning`, `include` | `{ effort: high, summary: auto }`, `["reasoning.encrypted_content"]` |
| `prompt_cache_key` | the native session id; no `prompt_cache_retention`, no `prompt_cache_options` |
| tools | 10 `function` tools, same names, order and parameter structure; no `strict` |
| input items | same order and kinds (developer, user, runtime context, reasoning, function call, function call output, steer, message, next user turn); reasoning ids and encrypted content replayed identically |
| headers | `accept`, `content-type`, `authorization` (the dummy), `session_id` and `x-client-request-id` (the native session id), the OpenAI SDK 6.40.0 `x-stainless-*` set |

The test fails without the pin, naming `strict: false` (checked in this session). The unit also records the pin (`model_route.compat`), and the gate rejects a bundle without it (`model_route_invalid`; `tests/integration/profile-gate.test.mjs`).

## Differences that remain (for D2)

None of these is a route field, and no route configuration can set them. Any newer unit carries them, including the fallback 0.2.0-rc.1.

| Difference | Where | Previous → candidate |
|---|---|---|
| `user-agent` | every request | `deepseek-harness/0.1.7-rc.1 (…)` → `deepseek-harness/0.2.0-rc.2 (…)` |
| System prompt text | `input.0.content` (developer) | 2270 → 1715 characters: dsh's prompt sections were rewritten upstream |
| Tool descriptions | 9 of 10 tools (`skill` unchanged) | shorter upstream wording, e.g. `todo_write` 396 → 24 characters, `workflow` 2763 → 1667 |
| Parameter descriptions | `update_goal.action`, `update_goal.blocked_reason`, `workflow.script`, `workflow.meta` | reworded upstream; the parameter structure is unchanged |
| Runtime-context snapshot | `input.2` | same length; differs only by the temporary workspace path of each run |

## Compat inherited from the catalog, not settable

The candidate's resolved gpt-6-luna model also inherits `supportsOpenAIGrammarTools`, `supportsAdditionalTools`, `supportsToolSearch`, `supportsMidConvoSystemMessages` and `supportsExplicitPromptCacheMode`, all `true`, plus `cost`, `inputLimits` and `thinkingLevelMap`. dsh withholds these five switches from route configuration. In this episode none of them changed a byte:
- no Sophia-visible tool declares a grammar;
- no tool is deferred;
- dsh sends no mid-conversation system message;
- no cache retention other than the default is requested.

**Not exercised here, and therefore not claimed:**
- an image input (the catalog's `inputLimits` would downscale images over 2000 px or 4.5 MB);
- compaction, and any other path that could put a system message mid-conversation;
- a `PI_CACHE_RETENTION=long` environment, which the launch environment does not pass.

`contextWindow` (272000) and `maxTokens` (128000) are numerically unchanged.
