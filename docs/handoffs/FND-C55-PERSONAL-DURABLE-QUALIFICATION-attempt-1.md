# Implementation-session handoff

Goal and attempt: FND-C55-PERSONAL-DURABLE-QUALIFICATION-01 (test-only qualification of the sealed Personal ADC),
attempt 1
Human owner / executor resource: Davide (assignment relayed from P; packet sha256 `4ac8b0d1…`) / Claude Code lane C
(transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-19/sophia-task-revalidation`, branch
`test/personal-durable-faults-20261019-c55`, from ADC `adc7274dd9a098cca654d4174c518e6f777e7314` (tree `13b77135…`)
Writable scope: `apps/api/src/personal-live.db.test.ts` and this record. Product source is ADC, unchanged.
Runtime unit: Davide's macOS host; Node 24.21.0, pnpm 11.7.0; own PostgreSQL 17.11 on 127.0.0.1:55499; the existing
local provider double (loopback, fake key). No GUI, provider, network or spend.
Ending commit/tree: the commit this record is in. Not pushed.

## Cases added (all through the normal live path: real API, restricted role, runner, composed dsh route, double)

1. **Without 0078: PASS.** FIXTURE, labelled: the owner moves 0078's binding table aside for the case only and puts it
   back. That table is what the product reads to decide whether 0078 is installed. A fresh 0078-less database can't sit
   beside the file's own: a second installation in one cluster is refused by design (0070, Q13); the first attempt's
   setup failure is kept. Result: `/ready` 503; the turn gets no answer; 0 provider requests; 0 reservations. This is
   not a whole old schema.
2. **Settlement fails before COMMIT: PASS.** FIXTURE: on the companion's own pool, after the settle statement, the
   transaction's COMMIT is refused before it is sent. Witnessed order: settle answered, then COMMIT refused. Result:
   1 provider request, none again; 1 reservation, not settled; no used cost (no zero, no refund); nothing kept; no
   answer shown.
3. **COMMIT done, acknowledgement lost: PASS.** FIXTURE: the COMMIT is sent and answered, then its answer is replaced by
   an error. Result: 1 provider request; 1 settled cost. After the claim lapses, the reply is shown once («the original
   answer»): written by the first runner or, if not, by a normal retry through a fresh API and runner. The case accepts
   either and does not record which happened. Still 1 request and 1 settled cost.
4. **Another owner:** not added; covered by the existing ADC case «answers only the payer's enrolled owner; anyone else
   is refused before anything is kept, reserved or sent» (not rerun here).
5. **Control 5, a stale runner released after another wrote the reply: FAILS (kept as a failing regression).**
   - Guard witnessed first: while runner 1 is alive, its watch renews the claim every 2 s, and a normal retry is
     refused 409 «Stale turn: it is pending» (log 30).
   - FIXTURE, labelled: runner 1 is stalled as a whole once held at its reservation (its context read, its reservation
     statement held, its renewals not reaching the database).
   - Runner 2 then takes the lapsed turn by a normal retry: 1 provider request, 1 settled cost, reply written, kept
     answer let go.
   - Runner 1 is released: `reserve_personal_answer` answers `reserved`, the provider is asked a **second time**, and a
     **second cost settles** (`["settled","settled"]`).
   - Source boundary: 0078 `reserve_personal_answer` checks only for a kept answer and that the person turn exists. It
     does not check the caller's claim or whether the turn was answered. The watch ignores a failed renewal, so a
     stalled runner does not learn it lost the claim before reserving.
   - Not fixed here (test-only scope). Reported to P.

## Not done

Case 4 (no new case); the whole-file run and the 28/28 keyless rehearsal (B's); `pnpm check`; browser.
