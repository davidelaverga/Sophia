# INC-COORD-1117-CODEX-API-ENTRY-001 — StageA

Status: uncommitted source candidate; **HOLD** for the same independent reviewer and coordinator composition.

## Assignment, source and ownership

This Codex implementation worker holds only `apps/api/src/server.ts`, three new API config/entry test files, and this
handoff. The base/unchanged HEAD is `de7a6ab257a98861bb3790dea65f228014a5d2cd`, tree
`6eb53bcf5a2e6283a0e3e473190d185052e71a33`. A new independent exact-main checkout was created under the worker's owned
scratch; no protected checkout, CommonGit state, prior worktree, donor or candidate was changed. The candidate tree,
full inventory, hashes, diff, commands and logs are sealed in the separate StageA export. No commit or push was made.

Programme owner: Davide. Coordinator remains sole manager; `/root/independent_review_app` remains the independent
source reviewer and later app verifier. This author does not supply independent acceptance. Product API account,
contribution owner/requester, grant, custody and actual allowance remain unknown. No resource authority is inferred.
The native author-session identifier is not exposed in the execution environment and remains unknown.

## States and transitions (recorded before code in the worker's assignment)

- Unset or literal `off`: A48 remains unmounted through stock `server.ts`.
- Literal `on`: stock entry forwards the existing `AppDeps.apiContributions` option; existing A48 routes and readiness
  checks apply. Exposure grants no funds, custody, qualification or research execution.
- Any other string, including blank, whitespace, case variants and padded values: fixed configuration error before
  pool creation, role checks, companion startup or listening. Configuration content is not echoed.
- Authentication, current membership/grant/source checks, immutable funding, endpoints, accounting, retained output,
  bound-output exposure and every other feature switch retain their existing implementations. No UI changes.

## Change and meaningful verification

`api-contribution-config.ts` parses only this switch. `server.ts` parses it before external startup work and forwards
its result. The config tests cover exact accepted and rejected values. The entry tests import the real stock server in
an isolated child, using the real Fastify app/routes/schemas and JWT verifier. Only pool construction/role-safety and
socket listening are replaced with test doubles; any database access fails. The test child receives only explicitly
synthetic config, with no inherited credentials or provider/companion settings. Module mocks use Node's experimental
flag in the child only; the normal parent test command needs no extra flag.

Stock-entry tests prove unset/off route absence, on funding-pin/task-funding/owner-resource route presence, existing
research reserve presence, bound-output route absence, health, unauthenticated 401, and schema 422 for each spoofed
actor/requester/owner/payer/credential field. The extra-property error is checked explicitly. Invalid config is tested
without even database/auth setup, so parsing after startup prerequisites fails the test. Child execution has a 30s
bound, and success requires an explicit completed-assertion marker, zero database accesses and expected startup counts.

Actual checks, exact Node `24.21.0` and pnpm `11.7.0`:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0; exact lock, 698 packages reused; repository allowlisted install scripts only |
| `pnpm toolchain:check` | exit 0 |
| `pnpm exec prettier --check apps/api/src/server.ts apps/api/src/api-contribution-config.ts apps/api/src/api-contribution-config.test.ts apps/api/src/api-contribution-entry.test.ts` | exit 0 |
| `pnpm exec oxlint --type-aware` on those same four TS files | exit 0, no findings |
| `pnpm --filter @sophia/api typecheck` | exit 0 |
| `node --test apps/api/src/api-contribution-config.test.ts apps/api/src/api-contribution-entry.test.ts` | final/restored exit 0; 7/7, no failed/cancelled/skipped tests |
| Remove only `apiContributions` forwarding, then run entry tests | expected exit 1; ON registered-route assertion fails |
| Move parser below pool creation, then run entry tests | expected exit 1; invalid case sees missing database setting instead of fixed switch error |
| Restore original candidate bytes after mutations | SHA-256 equality; focused 7/7 passes again |
| `git diff --check` | exit 0 |

Initial test failures were test assumptions, preserved in the external record: Fastify `hasRoute` requires the
registered parameter pattern, and repository schema failures return 422 rather than 400. Neither failure was hidden
by a product change. Initial format/lint/typecheck already passed. No runtime build is needed for this Node-stripped
API-only change; no runtime/bundle/lock/artifact identities changed. Full ordinary, SQL/DB and browser checks are not
leased here and were not run.

## Effects, limits and next action

No actual database/SQL execution, provider/native inference, real credential/environment/auth-store discovery, remote
flag, production configuration, account/grant mutation, UI, deployment, PR, commit, merge or release action. The only
installation was frozen dependencies in owned scratch; only the five leased repository paths changed. Existing
unknown effects/commitments, default-OFF capabilities, D1 off, suspended VoiceLab, Personal9e/UI owner decisions and
all automatic/current CI/Luis/RTA/app gates remain.

Some unleased existing comments in `app.ts` and `routes/api-contributions.ts` still say the stock server cannot enable
A48. This candidate intentionally leaves those files untouched under the exact lease; the coordinator can assign the
two comment corrections during serialized composition. They do not change runtime behavior.

The test observes the actual entry's listen boundary with injection, not a real listening service, database authority
or end-to-end retained result. Real contribution qualification remains separately held. Root must serialize this
server delta with the frozen f0b server change and maintained bound-output integration; no donor overwrite or helper
repair is included. Root next routes the full immutable candidate to the same independent reviewer, then arranges
current-main/coherent composition and applicable ordinary checks. **HOLD after export.**
