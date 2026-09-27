# Executable reference logic — not the Sophia application

These small, dependency-free TypeScript modules make several high-risk rules concrete and testable without credentials. They implement selected wire request builders, response normalization, product control/dispatch eligibility, a client event reducer and source-patch validation. They are a starting reference for the corresponding product packages, not a running Fastify/Omnigent/dsh integration.

Run from this directory with a TypeScript compiler installed: `npm test`. The command compiles the source, then runs Node's built-in test runner. No network/provider calls are made. The separate generated application API types can be checked with `tsc --noEmit --strict --target ES2022 ../api/generated-types.ts`.

`native-wire.ts` follows the selected donor source: device authorization is JSON; token exchange/refresh/revoke are forms; multipart creation returns session_id; hosts uses hosts; native 2xx denial is not success. The device client secret header belongs to server configuration and is attached only where its actual route requires it. A transport layer must use a fixed approved upstream origin, TLS, redirect refusal, bounded timeouts and secret-safe diagnostics.

`control.ts` separates fencing, native delivery and settlement. Its proof flags must be populated by actual adapter observations; setting them optimistically defeats the model. It does not implement distributed synchronization. PostgreSQL binding locks and the dispatch service implement serialization in the product.

`projections.ts` does not replace server authorization. It expects authorized Event/CursorAdvance frames, preserves BIGINT strings and detects gaps. The product bounds seen-event caches and resnapshots on reset/revocation; pending drafts remain local and are not resubmitted automatically.

`source-patch.ts` validates syntax and expected identities. The production filesystem boundary additionally resolves realpaths, rejects escaping symlinks, verifies content hashes, checks current source eligibility and restricts mounts. S1 supports deliberate source editing and review-to-steer; these functions do not establish universal exact natural-language editing.

**Not tested here:** upstream runtime compatibility, live auth, native permission handling, native process termination, database concurrency/RLS, browser rendering, Google media, model quality, deployments, operating-system isolation or three-owner-resource collaboration. See `../evidence/` for actual reference-test results and the separate unrun integration list.
