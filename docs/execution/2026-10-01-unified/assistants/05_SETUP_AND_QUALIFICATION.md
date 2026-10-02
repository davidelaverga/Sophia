# Guided setup and qualification

## One template or one skill on an existing assistant

Provide the literal [Project Assistant template](../assets/grok/PROJECT_ASSISTANT.md) and [knowledge-import skill](../assets/grok/skills/knowledge-package.md). The template is a reviewed starting configuration, not a live clone of our account. Use a clean template authoring account/environment with no customer content, credentials, private memories or internal endpoints before any separately approved publication.

Template import and Bot duplication are different provider operations; neither is proof that a newly created copy has the user's existing conversations. A knowledgeable existing assistant can use the cooperation/import skill instead. Some documentation describes relevant template memories while duplication excludes learned memory: inspect the actual exported package rather than rely on either phrase as an automatic privacy guarantee. Custom MCP connection material requires separate setup. [GB-TEMPLATE; GB-WORK]

## Enrollment sequence

1. In personal Sophia, explain provider data handling, account scope, native permissions, billing limitations and what is not shared. The owner selects an existing eligible account; Sophia neither buys nor resells a subscription.
2. Complete the actual provider import/skill step. Review the details before installation. Link eligible accounts only in the provider's native flow, with explicit warning about any permanent/non-stacking relationship.
3. Authorize the Sophia remote MCP through a supported OAuth flow. Use a reviewed OAuth server/provider: authorization code with PKCE, state/nonce protection, exact registered redirect matching, audience/resource-bound tokens, short-lived access and rotated/revocable refresh credentials where supported. Use observed client metadata rather than hardcoded guessed callbacks. No wildcard redirects or secrets placed in messages as a workaround.
4. Sophia resolves the verified token subject to the signed-in owner and a specific enrolled connection. Scopes are narrowly personal-job/read-message/write-message/upload. No team publication tool is issued.
5. For Sophia activation, the owner configures one event-only routine using [the routine instruction](../assets/grok/ROUTINE_INSTRUCTION.md), then enters its URL/key in an owner-only secure Sophia enrollment form. Store the secret server-side, redact it from logs and never return it to the model. If a secure supported input path is unavailable, do not expose it through chat.
6. Run one harmless round-trip: retrieve synthetic job, ask a question, owner replies in Sophia, retrieve reply, return corrected text, then revoke the test connection and confirm denial. A separate safe webhook test qualifies start and continuation.
7. Show exactly which capabilities passed and which remain unavailable. A failed connection does not produce a ready label or silently change provider.

## Known provider boundary

First-party support documented a custom-MCP OAuth registration incompatibility with Cloudflare Access and corrected an unsafe suggestion to configure arbitrary secret headers. Treat that as a compatibility warning, not proof every OAuth server fails. Qualify Sophia's actual auth server on the intended desktop/client and refuse a credential-in-chat fallback. [GB-OAUTH]

No public provisioning API was verified for buying subscriptions, importing/configuring a user's Bot or enumerating its private memory. Design guided setup, not a fictitious fully in-app Create Bot button.

## Pilot configuration choices

Use one owner, one connection, one active assignment and a non-sensitive collection example first. On-demand disabled by the owner; no purchases, account mutations or production tools. Keep a native open-Bot recovery path, but no browser automation impersonating the owner or scraping provider conversations to obtain results.

Check OAuth connect, expired access refresh, restart, owner mismatch, revocation, tool-schema mismatch, partial upload, uncertain wake, and masked errors. Scope any real provider usage with a separate human grant. A test run performs real work and can consume usage; it is not free merely because its label is Test.

## Exit

PA-00 ends with a capability/binding report and one working authenticated exchange, or a precise unsupported boundary. Do not spend an unbounded mission building around undocumented endpoints. Local fixtures can continue without a provider account, but they do not close live acceptance.
