# Image generation: two real providers, one asset workflow

**Detailed API design.** Generation happens in durable jobs, not inside an open voice request. **Sources:** G-01, G-07/08, OA-01–OA-03. Exact IDs are recorded in `config/models.json`.

## 1. Initial catalog and roles

| Role | Model | Decision |
|---|---|---|
| Default visual exploration | `gemini-3.1-flash-image` | Google Interactions API, 1K initial asset |
| Principal OpenAI comparator | `gpt-image-2.5-sunburst-2026-09-08` | Direct Images API; medium initial quality |
| Google professional comparator | `gemini-3-pro-image` | Explicit comparison choice, not automatic fan-out |
| OpenAI speed comparator | `gpt-image-2.5-flare-2026-09-08` | Explicit comparison choice |
| Low-cost later extension | `gemini-3.1-flash-lite-image` | Kept in extensions; not another S1 integration dependency |

Google's model IDs here are provider aliases; log returned model/version metadata when supplied and recheck them on upgrade. The dated OpenAI IDs are snapshots. Do not label the same Google alias as an immutable September snapshot. The model catalog is capability data, not a claim that the account has already been tested.

The user selects a provider/model only when useful. The normal command is “Explore this direction.” “Compare Google and OpenAI on this” creates an explicit comparison job with two child requests and a shared source/brief revision.

## 2. Shared request contract

An `ImageJob` contains project/owner, intent (`generate|edit|compare`), source brief version, model routes, requested aspect/output size, selected reference asset IDs, optional mask asset ID, requested count, budget reservation and policy revision. Reference assets are resolved by the backend only after checking current eligibility.

Default to one candidate per selected route. A comparison does not quietly multiply requested counts, retry limits or quality levels. The job preserves the original brief and provider-specific request settings so differences are explainable later.

## 3. Google API binding

Use `GoogleGenAI.interactions.create`. Use `store:false` and submit the selected prompt/reference bytes for the current operation. This avoids building a hidden long-lived Google conversation chain. Do not use `previous_interaction_id` while claiming the request is stateless. [G-07, G-08]

**Request specimen:**

```ts
const result = await ai.interactions.create({
  model: 'gemini-3.1-flash-image',
  input: [
    { type: 'text', text: brief },
    // Approved reference inputs use: type:'image', mime_type, data (base64).
  ],
  store: false,
  response_format: {
    type: 'image', mime_type: 'image/png',
    aspect_ratio: '1:1', image_size: '1K',
  },
});
```

For this API the documented image fields are under `response_format`, not a guessed `generation_config.image_config`. Read `steps`; retain images in `model_output` content. Do not publish interim thought images as final assets. Decode actual returned MIME/bytes and verify dimensions and the output count. Preserve associated final text separately.

An edit submits the selected original image bytes plus the edit instruction as a fresh request. The provider may change more than the intended region; the output is a candidate until reviewed. Reference generation is not a pixel-preservation guarantee.

## 4. OpenAI API binding

Use the direct **Images API** rather than an additional mainline text-model Responses call merely to invoke image generation. Generation uses `POST /v1/images/generations` with JSON; editing uses `POST /v1/images/edits` and its documented image input form. [OA-03]

**Generation specimen:**

```json
{
  "model": "gpt-image-2.5-sunburst-2026-09-08",
  "prompt": "<compiled approved visual brief>",
  "size": "1024x1024",
  "quality": "medium",
  "n": 1
}
```

For edits, upload only the authorized source/reference images and mask using the supported multipart request. Validate the selected model's accepted fields instead of copying parameters from a different image generation family. Parse `data[].b64_json`, actual MIME/output format and any returned usage/revised prompt metadata. A refusal or missing image is not a successful empty artifact.

The current model card does not support a native streaming claim for Sunburst. Stream **job state and received candidates**, not fabricated progressive image tokens. Preserve request IDs without putting API keys or signed source URLs in logs. [OA-01]

## 5. Job and asset lifecycle

```text
admitted → request prepared → sent → provider result
           ↘ denied                ↘ uncertain/refused/failed
provider result → byte validation → immutable candidate → user selection
user selection → approved asset reference → prototype/report/deck source
```

Store each candidate under its own immutable asset ID/hash. An approved image is referenced by source components; an unrelated text edit must not regenerate it. An edited image creates a new candidate linked to the old asset. Acceptance updates references by expected version; failed generation preserves the existing selected asset.

The application retries before-send transient failures under the job policy. After uncertain provider acceptance, it records uncertainty and reconciles available response/request information before a billed retry. A provider without result lookup cannot be promised free exactly-once retry. A cancellation stops future publication and asks the client to abort, but may not eliminate already incurred usage.

## 6. Comparison that is useful rather than ceremonial

Start with three work-shaped cases: a hero/illustration that must fit a real UI; an infographic containing exact supplied labels; and an edit preserving a selected composition. Run the first two routes against the same approved brief and references. Compare legibility, brief fidelity, visual fit, preservation, latency, actual usage and human repair. Different provider quality/resolution controls are not assumed numerically equivalent.

Allow Davide/Luis to choose a result in the real project immediately. Retain failures and rejected candidates. Add one fresh example before promoting a new default on a claim of better performance. This is a small product experiment, not a prerequisite to use every creative capability or a benchmark superiority claim.

## 7. Voice integration

Live's `start_image_job` returns a committed job ID quickly. The job publishes a candidate event; Studio shows it in the current project and Live receives a bounded current-context update. The selected image can then become a prototype reference. Closing the voice exchange does not lose the job; a delayed image must not interrupt another room or enter an unapproved audience.

## 8. First acceptance

A real Google request and a real OpenAI request each produce a usable asset. A selected asset enters the actual prototype source. An edit returns a distinct candidate and retains the original. The same voice request is not billed twice after reconnect. A refused/timed-out request is visible. Record exact model/settings, source hashes, observed duration and usage, not a guessed fixed cost per image.
