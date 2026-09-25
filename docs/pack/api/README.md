# Application and native wire contracts

`openapi.json` is the authoritative **proposed Sophia HTTP contract**, version 0.4.0-design. It does not document an already deployed service. `generated-types.ts` is mechanically generated from it; `route-bindings.json` maps each operation to its code destination, service, records and goal. `omnigent-wire-fixtures.json` contains labelled synthetic donor-contract examples, not captured provider responses.

Generate/check with `python scripts/generate_api_types.py` or `python scripts/generate_api_types.py --check` from the pack root. Runtime request validation must implement the JSON Schema constraints; generated TypeScript alone does not validate UUIDs, hashes, integer ranges or unknown properties.

All own IDs are UUIDs; native IDs stay opaque in the adapter. All project event sequences are decimal strings. The user identity comes from a verified bearer, never a request body's actor field. POST admission requires a stable Idempotency-Key; callers reuse it after an ambiguous *Sophia admission* reply. The backend never converts that into blind retries of native message sends, launches or rotating refresh requests.

Owner-only connections are not project resources until registration selects the actual host, repo and grant. A public resource view excludes credentials and arbitrary home paths. S2 approval routes reject in S1 rather than displaying a nonfunctional Allow button. The UI consumes only this API plus a scoped media room; it does not receive broad Omnigent API access.

Streaming Event envelopes carry content references and safe projection metadata. Authorized source reads are separate. `cursor.advanced` skips intentionally hidden content without fabricating missing work. A snapshot/cursor is read consistently; membership is checked again after reconnect and on revocation.

## Contract vs implementation coverage

The reference TypeScript tests validate selected wire builders, state rules, source-path rules and a client reducer. They do not implement these Fastify routes. The SQL supplies a selected foundational command/publication/queue slice; specialized import, source extraction, decisions, media, peer dispatch and provider adapters remain product work in their existing goals. `../implementation/README.md` and `../db/README.md` state test scope exactly.

OpenAPI operation descriptions are deliberate decisions. Where an upstream source differs, the adapter translates it—e.g. Omnigent multipart creation returns `session_id`, not the full JSON creation response; host listing returns `{hosts:[...]}`. Never send Sophia's `created_by` as if it were a native authenticated human. [OM-03, OM-04, OM-05, OM-06, OM-09]
