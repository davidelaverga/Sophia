# R1-F02: the source reviewer's manifest read and refused submissions

Goal and attempt: R1-F02 (FND-A2-R1-F02, packet v1), attempt 1. Human owner / executor resource: Davide / Claude A.  
Native session: Claude Code `local_775c886b-f077-43c7-a07c-74868ab14b5c`.  
Starting worktree/commit: `foundation/review-f02-20261016` from `main` at `f6be9fa7cd7b83ca688878390d474f0f2899bf69`.  
Ending commit/tree and changed files: resolve from the commit containing this record; `packages/dsh-bundle/src/
{review-tools.ts,transport.ts}`, `tests/unit/review-tools.test.mjs`, `config/runtime-unit.json`,
`config/dsh/profile/pnpm-lock.yaml` (recorded bundle identity) and this record.

## Outcome

Two defects at the bridge's review-tool boundary are proven and corrected; their link to the R1 failure is inferred,
pending the native session's own tool events.

1. A read the bridge refuses under its own request contract was told "the Sophia service could not be reached" and sent
   nothing. Now an empty `sourceId` reads the task, as omitting it does, and any other `sourceId` off the contract (not a
   manifest UUID: a ref such as `S1`, a word) is not sent and is answered `invalid_request` with the field, what it must
   be, and the sourceIds the review may read.
2. A submission the service refused as `invalid_request` reached the model as the general rule only; the service's own
   reason (0042 `review_checks`: the missing section, the unknown criterion, the source not read whole) was discarded.
   Now the model gets that reason, bounded to 300 characters on one line.

The prompt, SQL, API and contract are unchanged; malformed, partial-source, withdrawn, stopped and unauthorized
submissions are refused exactly as before. Not shown: a published review on the native host (no commission was run).

## Evidence

Proven by reproduction, through the real tools, `ServiceTransport` and generated wire validators against a local
stand-in of the API (source-faithful, not the API itself): `sourceId` `""`, `"S1"` or `"manifest"` sends nothing and
answers `service_unavailable`; `null` is refused earlier by the tool's own argument check, with another message. A 422
`invalid_request` whose body says "missing: Goal" reaches the model as the general rule. The new tests fail on the old
source (2 of 21) and pass on this one. The API already returns the SQL reason as the 422 body's message, and the
PostgreSQL suite asserts it for an unserved receipt and an unread source (`coordination.db.test.ts`); a valid complete
publication crosses the real API, SQL and generated validators there.

Inferred, pending native evidence: in the R1 review (private evidence with the coordinator) the route log holds the six
settled model calls the receipt reports and one `context` request, after the second model call, which was the source's
page (its receipt was issued that second). So the reviewer's task read apparently never reached the service, yet the
model reported `service_unavailable`, which fits defect 1. Its two submissions reached the service and were refused as
`invalid_request`, and it reported "no validation detail", which fits defect 2. The native tool arguments and results
were not retained in the service's logs, so the read's actual input, the session binding it used and the submissions'
actual payloads and refusal reasons are not known. A different cause is not excluded (an incomplete log window, or a
binding fault).

## Decisions and changes

`TransportError` keeps the service's message only for an `invalid_request` refusal (`detail`), control characters
removed, at most 300 characters; every other message is still dropped. A request refused by the bridge's own contract
check names the failing path from the generated validator. A reply off the contract stays `service_unavailable`: that
is the service's fault, not the model's. The bundle's recorded identity changed with its source.

## Remaining obligations

The rebuilt runtime artifact must be deployed by the operator before a native review can use this. The first authorized
post-merge commission is the operator's; the cancelled R1 commission is not restarted.

## Next bounded action

Independent review and merge; the operator deploys the recorded runtime unit and runs one authorized review commission.
