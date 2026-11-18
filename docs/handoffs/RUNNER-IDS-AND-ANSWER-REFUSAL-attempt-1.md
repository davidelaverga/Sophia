# Handoff: API · runner operation ids in any declared spelling; a non-owner's Answer refused for good

Goal and attempt: integration review of #513 (evaluacion-2026-11-16/revision-513.md), P3s 6 and 7, attempt 1\
Human owner / executor resource: Luis («Debemos poder ir avanzando en otra cosa», 2026-11-16); the Claude Code session
that built it\
Starting worktree/commit: `D:/Descargas/SophiaV4/Sophia-paper-4`, local branch `api/runner-ids-and-answer-refusal`
from main `9495c87fc` (through #513 and #501)\
Changed files: `apps/api/src/routes/runner-operations.ts`, `schemas.ts`, `personal-answers.ts`, the new unit tests
`routes/runner-operations.test.ts` and `routes/personal-answers.test.ts`, `runner-operations.db.test.ts`,
`personal-answers.db.test.ts`, `docs/plans/runner-ids-and-answer-refusal.md`, this file.

## Outcome

- **6. Runner operation ids.** A47/A50 declare `resourceId`, `goalId`, `targetOperationId` and each `sourceIds` entry
  `format: uuid` (any case, optionally `urn:uuid:`); 0092/0096 read only lowercase. The POST now hands the database
  `canonicalRequest(req.body)`: each of those ids as its last 36 characters, lowercase. So every spelling names one
  operation, and the digest and key see one request. `canonicalId`, the one-liner the A48, A51 and A53 routes each keep
  locally, is now exported from `schemas.ts` and imported here. Two spellings of one source collapse to one id and get
  0096's own refusal «A source is named once» (422). Path ids stay lowercase-only.
- **7. A non-owner's Answer.** A send or retry from someone the live companion does not serve answers 503
  `unavailable` with the same words, now with `retry: never` (was `safe_read`). The body is written by the route, as
  `needs.ts` and `project-resources.ts` write theirs; the `unavailable` disposition (safe_read, for an outage) is
  unchanged. The served owner whose live settings make no profile still gets safe_read.

Unchanged: `packages/persistence/src/runner-operations.ts` (#519), every migration, the contract, the Studio.

## Evidence

- Red, item 6, on `dfa6b1c8d` (tests only): `routes/runner-operations.test.ts` fails at the first non-lowercase
  spelling: «upper case: {"code":"not_found","message":"Resource not found",…} 422 !== 202». Its database is a fake
  that answers as 0096 does for an id `uuid_re` can't read and records what the admission is sent.
- Green on `c8187e761`: that test passes (lowercase, upper case, `urn:uuid:`, `URN:UUID:` all reach the database as
  the lowercase ids).
- Red, item 7, on `07fe93c9f` (tests only): `routes/personal-answers.test.ts`: «[503, 'unavailable', 'safe_read']»
  expected «[503, 'unavailable', 'never']» on the stranger's send.
- Green on `73e641e21`: the stranger's send and retry answer 503 / unavailable / never, no Answer writer is called, and
  the owner's own send still reaches `send_personal_answer_input`.
- Both: `oxlint --type-aware .` clean; `tsc` clean in apps/api and apps/studio; prettier clean on every touched non-docs
  file. API unit tests: all pass except `byte-backup.test.ts` and `byte-backup-quota.test.ts` (13, «report backup
  directory is not private»: POSIX modes on Windows; untouched files).
- **Not run here:** the `*.db.test.ts` additions (no PostgreSQL on this machine). They run in CI through
  `pnpm test:db`: `runner-operations.db.test.ts` «reads every spelling A47 declares of a body id as the one id» (a
  replay under one key in upper case and `urn:uuid:` returns the first receipt; an upper-case input and a `urn:uuid:`
  Stop land with `target_operation_id` = the create), and in `personal-answers.db.test.ts` the stranger's send and
  their retry of the owner's waiting input both assert `[503, 'unavailable', 'never']`.

- Review round (independent review: no P1/P2; four P3s). The runner unit test now also asserts one semantic digest
  across the four spellings; with the pre-fix route and the fake made to accept every spelling, that check alone fails
  («every spelling is digested as the lowercase one»). The Answer unit test now asserts the owner's send is answered
  202 with its receipt, and that the owner whose live settings make no profile gets `[503, 'unavailable',
  'safe_read']` and asks nothing of the database. The three local `canonicalId` copies stay: #519 changes
  `api-contributions.ts` (checked with `git diff --name-only origin/main...pr/519`; #514–#518 touch none of the
  three), so `schemas.ts` says so instead. The header comment of `personal-answers.ts` is rewrapped to 120.

## Deviations

- The review says the runner route answers «404»; the code answers 422 `not_found` (0096's 22023 «… not found» →
  `not_found`, whose disposition is 422).
- `sourceIds` is canonicalised too: 0096 checks it with the same lowercase `uuid_re` (0096:478), so the same flaw.
- Item 7 keeps 503, not 403: A53 lists 403 for these routes only as «Not permitted: a guest», while its 503 names this
  case («Sophia does not answer this person live (nothing was kept)»). No contract change was needed.
- The three existing local `canonicalId` copies (`api-contributions.ts`, `project-resources.ts`,
  `personal-answers.ts`) are left until #519, which changes `api-contributions.ts`, has landed.

## Remaining limits

- The database tests were written but not run locally; CI is their first run.
- Path ids on runner-operations still accept only lowercase (`UUID_PATTERN`), though A47 declares `projectId` and
  `operationId` `format: uuid` too: an upper-case or `urn:uuid:` path id is refused 422 by the schema. The same kind of
  gap, outside this item (the review named the body ids); A48/A51/A53 show the fix (declared format, then
  `canonicalId`).

## Next bounded action

Independent review of the four commits on `api/runner-ids-and-answer-refusal`, then batch with the next verified
branches; watch the db job for the two new database cases.
