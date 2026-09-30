# SMC-M02 G2: workspace lock delta (`pnpm-lock.yaml`, `acfa348` → this PR)

Produced by `pnpm install --no-frozen-lockfile` after only the two manifest pins changed (`runtime/dsh/package.json`, `packages/dsh-bundle/package.json`: `0.1.7-rc.1` → `0.2.0-rc.2`); every other specifier stayed as locked. Importers changed: `runtime/dsh` and `packages/dsh-bundle` only. Diffed with a scratch script over the parsed `packages` keys.

**Every non-`@deepseek-ai` change below is transitive from the dsh 0.2.0-rc.2 closure:**

| Change | Pulled by (at 0.2.0-rc.2) |
|---|---|
| `@earendil-works/pi-ai`, `pi-telemetry` 0.85.1 → 0.87.1 | `@deepseek-ai/dsh-llm-pi-ai` (`^0.87.1`). This is R1; see [request-shape](request-shape/README.md) |
| `@google/genai` 1.52.0 → 2.21.0, `@anthropic-ai/sdk` 0.123 → 0.124, `@aws-sdk/*` 3.1048 → 3.1127, `https-proxy-agent` 9.1.0, `typebox` 1.3.27, and the `@aws-crypto`/`@smithy` removals | pi-ai 0.87.1's provider SDKs. **The media bridge's own `@google/genai` stays 2.24.0** (its importer is unchanged); the 2.21.0 copy loads only inside the dsh runtime's pi-ai |
| `koffi` and `@koromix/koffi-*` 3.3.1 → 3.1.1 (six platform prebuilds dropped) | exact pins in `dsh-fs-local`, `dsh-subprocess-local`, `dsh-session-persistence-jsonl`, `dsh-host-directory-picker-native`, `dsh-sandbox-windows-acl`, `dsh-win32-process`. `allowBuilds` already admits `koffi` by name |
| `got` 14.6.6 and its closure (`cacheable-request`, `keyv`, `http2-wrapper`, …), `proxy-agent-negotiate`, `@js-temporal/polyfill`, `jsbi` | `@deepseek-ai/dsh-otel` (the `otel` row, disabled by the bundle) and other dsh packages |
| `@opentelemetry/exporter-logs-otlp-http` removed | no longer in the dsh closure |

**New `@deepseek-ai` packages in the closure:** `dsh-client-product-analytics`, `dsh-client-shortcuts`, `dsh-client-ui-settings-session-log`, `dsh-client-ui-shortcuts`, `dsh-experimental-auto-review`, `dsh-experimental-schedule-bundle`, `dsh-host-product-telemetry-otel`, `dsh-llm-deepseek-account`, `dsh-llm-deepseek-api-key`, `dsh-otel`, `dsh-util-code-language`. A package in the closure loads only if a composed row names it. The gate's reviewed base-row inventory and its composition check, which compares against the dump, decide which do. `dsh-host-product-telemetry-otel` and `dsh-client-product-analytics` are dependencies of `dsh-web-app`, which `sophia-runtime` does not compose. No `@deepseek-ai` package was dropped.

## Raw delta

```
dsh added 284 dsh removed 273
@anthropic-ai/sdk: 0.123.0 -> 0.124.0
@aws-crypto/sha256-browser: 5.2.0 -> -
@aws-crypto/sha256-js: 5.2.0 -> -
@aws-crypto/supports-web-crypto: 5.2.0 -> -
@aws-crypto/util: 5.2.0 -> -
@aws-sdk/client-bedrock-runtime: 3.1048.0 -> 3.1127.0
@aws-sdk/token-providers: 3.1048.0 -> 3.1127.0
@aws-sdk/util-locate-window: 3.965.10 -> -
@earendil-works/pi-ai: 0.85.1 -> 0.87.1
@earendil-works/pi-telemetry: 0.85.1 -> 0.87.1
@google/genai: 1.52.0 -> 2.21.0
@js-temporal/polyfill: - -> 0.5.1
@keyv/serialize: - -> 1.1.1
@koromix/koffi-android-arm64: 3.3.1 -> -
@koromix/koffi-android-x64: 3.3.1 -> -
@koromix/koffi-darwin-arm64: 3.3.1 -> 3.1.1
@koromix/koffi-darwin-x64: 3.3.1 -> 3.1.1
@koromix/koffi-freebsd-arm64: 3.3.1 -> 3.1.1
@koromix/koffi-freebsd-ia32: 3.3.1 -> 3.1.1
@koromix/koffi-freebsd-x64: 3.3.1 -> 3.1.1
@koromix/koffi-linux-arm: 3.3.1 -> -
@koromix/koffi-linux-arm64: 3.3.1 -> 3.1.1
@koromix/koffi-linux-ia32: 3.3.1 -> 3.1.1
@koromix/koffi-linux-loong64: 3.3.1 -> 3.1.1
@koromix/koffi-linux-ppc64: 3.3.1 -> -
@koromix/koffi-linux-riscv64: 3.3.1 -> 3.1.1
@koromix/koffi-linux-x64: 3.3.1 -> 3.1.1
@koromix/koffi-openbsd-arm64: 3.3.1 -> -
@koromix/koffi-openbsd-ia32: 3.3.1 -> 3.1.1
@koromix/koffi-openbsd-x64: 3.3.1 -> 3.1.1
@koromix/koffi-win32-arm64: 3.3.1 -> 3.1.1
@koromix/koffi-win32-ia32: 3.3.1 -> 3.1.1
@koromix/koffi-win32-x64: 3.3.1 -> 3.1.1
@opentelemetry/exporter-logs-otlp-http: 0.220.0 -> -
@sindresorhus/is: - -> 7.2.0
@smithy/is-array-buffer: 2.2.0 -> -
@smithy/node-http-handler: 4.7.3 -> -
@smithy/util-buffer-from: 2.2.0 -> -
@smithy/util-utf8: 2.3.0 -> -
@types/http-cache-semantics: - -> 4.2.0
agent-base: - -> 9.0.0
byte-counter: - -> 0.1.0
cacheable-lookup: - -> 7.0.0
cacheable-request: - -> 13.0.19
decompress-response: - -> 10.0.0
form-data-encoder: - -> 4.1.0
got: - -> 14.6.6
http-cache-semantics: - -> 4.2.0
http-proxy-agent: 7.0.2 -> 9.1.0
http2-wrapper: - -> 2.2.1
https-proxy-agent: - -> 9.1.0
jsbi: - -> 4.3.2
keyv: - -> 5.6.0
koffi: 3.3.1 -> 3.1.1
lowercase-keys: - -> 3.0.0
mimic-response: - -> 4.0.0
normalize-url: - -> 8.1.1
p-cancelable: - -> 4.0.1
proxy-agent-negotiate: - -> 1.1.0
quick-lru: - -> 5.1.1
resolve-alpn: - -> 1.2.1
responselike: - -> 4.0.2
type-fest: - -> 4.41.0
typebox: 1.3.7 -> 1.3.27
new dsh pkgs: [
  '@deepseek-ai/dsh-client-product-analytics',
  '@deepseek-ai/dsh-client-shortcuts',
  '@deepseek-ai/dsh-client-ui-settings-session-log',
  '@deepseek-ai/dsh-client-ui-shortcuts',
  '@deepseek-ai/dsh-experimental-auto-review',
  '@deepseek-ai/dsh-experimental-schedule-bundle',
  '@deepseek-ai/dsh-host-product-telemetry-otel',
  '@deepseek-ai/dsh-llm-deepseek-account',
  '@deepseek-ai/dsh-llm-deepseek-api-key',
  '@deepseek-ai/dsh-otel',
  '@deepseek-ai/dsh-util-code-language'
]
dropped dsh pkgs: []
importer changed: packages/dsh-bundle
importer changed: runtime/dsh
```
