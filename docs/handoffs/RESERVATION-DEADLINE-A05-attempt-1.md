# A review model call's accounting: no resend starts past its deadline

Goal and attempt: FND-A05-RESERVATION-DEADLINE-SOURCE-01, attempt 1. Human owner / executor resource: Davide / Claude A.
Native session: Claude Code `local_775c886b-f077-43c7-a07c-74868ab14b5c`.  
Starting commit: `3274560cc4d8a2a0ccfec11bad00d3fe180b1e3e` (tree `c1adab56`), branch `fix/reservation-deadline-20261020-a05`.
Changed files: `packages/dsh-bundle/src/review-tools.ts`, `tests/unit/review-tools.test.mjs`, `config/runtime-unit.json`,
`config/dsh/profile/pnpm-lock.yaml` and this record.

## Outcome

`untilAnswered` admitted a 1 ms retry pause while time remained, but after the pause it checked only for a Hold or Stop
and sent again, with a fresh 1 ms budget, even when the pause had resumed past `maxMs` (A04 executed this for a
reservation and a settlement on 327: second requests at 110-111 ms of a 100 ms budget). Now a resend checks the deadline
first and ends as unknown once it has passed. Unknown is still never permission to call; the first request, Stop and
cancellation, an immediate refusal, same-body resends within the deadline and settlement are unchanged. The guard stops a
new request from starting late; it cannot make a blocked event loop finish a request or a pause on time, and nothing here
covers wall-clock jumps.

## Evidence

The new case in `tests/unit/review-tools.test.mjs` fails each operation's first request at once (502), then holds the
event loop for 110 ms with a timer queued before the retry's pause, so the pause resumes after the deadline; no clock is
stubbed, and it asserts that the stall did end past the deadline. On 327 it fails ("reserve sent at 0,112 ms"); with the
guard it passes, and the whole file passes (25 of 25), the unchanged hung case at line 535 among them. `pnpm
artifacts:record` recorded the new bundle identity (`sha256:2897b8b0…`) and `pnpm artifacts` reproduced every identity.
The cause of CI's three requests in the hung case is still unknown; this is an adjacent proven boundary, not that cause.

## Next bounded action

R2 reviews; B integrates.
