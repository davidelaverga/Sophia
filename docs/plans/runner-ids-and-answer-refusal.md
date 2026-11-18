# Runner operation ids in any declared spelling; a non-owner's Answer refused for good

> 2026-11-16 · P3s 6 and 7 of the integration review of #513 (`evaluacion-2026-11-16/revision-513.md`, «API»).
> Luis 2026-11-16: «Debemos poder ir avanzando en otra cosa». API routes only (`apps/api/src/routes`); no migration,
> persistence, contract or Studio change.

## Measured

- **6. A contract-valid id is "not found".** A47/A50 declare `OwnerRunnerOperationRequest.resourceId`, `goalId`,
  `targetOperationId` and each of `sourceIds` as `format: uuid`, which the API's validator takes in any case and with a
  `urn:uuid:` prefix. The route (`runner-operations.ts`, the POST) hands the body to `admitRunnerOperation` as sent,
  and 0092/0096 check every id against a lowercase-only `uuid_re` (0096:398, :431, :437, :478) before reading it. So an
  owner naming their own resource as `ABCD…` or `urn:uuid:abcd…` is told «Resource not found» (`not_found`, which
  the API answers 422, not 404 as the review says), and the same for the goal, the target operation and a source. The
  semantic digest is taken over the request as sent, so two spellings of one request would also be two requests.
- **7. A retry invited that can never succeed.** `personal-answers.ts` refuses a send or retry from anyone the live
  companion does not serve (`profileFor`) with `DomainError('unavailable')`, which is 503 with `retry: safe_read`. A
  live companion answers one owner; the person asking is not them, and asking again will not make them so.

## What changes

1. **One spelling of each body id (6).** The POST passes the body through `canonicalRequest`: `resourceId`, `goalId`,
   `targetOperationId` and every `sourceIds` entry, when present, become their last 36 characters in lower case, the
   same `canonicalId` the A51 resource and A53 answer routes apply to their path ids (exported from `schemas.ts`, so
   the next route takes it rather than a fourth copy). The schema has already accepted each value as `format: uuid`,
   so that is exactly the id. The database then reads every spelling as one, and the digest and the idempotency key
   see one request. Two spellings of one source in `sourceIds` (distinct to the schema's `uniqueItems`) become the
   same id and get 0096's own refusal «A source is named once» (422). Path ids stay lowercase-only, as before.
2. **Refused with `retry: never` (7).** A53 lists 403 for these routes only as «Not permitted: a guest», and its 503
   names exactly this case («Sophia does not answer this person live (nothing was kept)»). So the status stays 503
   and the code `unavailable`, with the same words, and the retry disposition becomes `never`: the body is written by
   the route, as `needs.ts` and `project-resources.ts` write theirs, because `unavailable`'s disposition (safe_read)
   is right for a database outage and stays. Only the not-served case changes; the served owner whose live settings
   make no profile now keeps `safe_read` (an operator's change can end it).

## Tests

- Unit (no database): the route through `buildApp` with a recording fake pool. An upper-case and a `urn:uuid:`
  spelling of every body id reach the database as the lowercase one; a stranger's send and retry answer 503
  `unavailable` with `retry: never`, and the owner's request is still taken.
- CI (`*.db.test.ts`, real PostgreSQL through `pnpm test:db`): the same key with an upper-case and a `urn:uuid:` body
  replays the lowercase create's receipt, and an input and a Stop naming the target in those spellings act on that
  operation; the stranger's send and retry carry `retry: never` and keep nothing.

## What does not change

`packages/persistence/src/runner-operations.ts` (#519 changes it), 0092/0096 and their `uuid_re`, the contract, the
path schemas, every other refusal and its disposition, and the legacy Personal routes.
