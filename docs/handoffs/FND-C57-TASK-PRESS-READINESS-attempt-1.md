# Implementation-session handoff

Goal and attempt: FND-C57-TASK-POINTER-QUALIFICATION-01 (Task 1422 Room2: «the room in a call» pointer feedback),
attempt 1
Human owner / executor resource: Davide (assignment relayed from P; packet sha256 `84c8148a…`) / Claude Code lane C
(transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-19/sophia-task-revalidation`, branch
`test/task-press-readiness-20261019-c57`, from Task `1422d67159e7446e3b6db369df9d5af69a7c5b47` (tree `3b4d7b2b…`)
Writable scope: `apps/studio/e2e/press-answers.spec.ts` and this record. No product, fixture, config or dependency change.
Runtime unit: Davide's macOS host; Node 24.21.0, pnpm 11.7.0; headless Chromium on fixture ports 5198/5199. No
PostgreSQL. Ending commit/tree: the commit this record is in. Not pushed.

## Witness (private diagnostic; P's journal, `C57-artifacts/`)

- The diagnostic copied `PRESSES`, `listPresses` and `lookOf` byte for byte and replayed the test's sequence:
  - list the presses after `drawn`;
  - wait for the entrances;
  - hover each press by its listed index and point, recording identity, rect, hit target and looks.
- Unthrottled (10-): at list time the call was already live. The five controls kept their identity, each point hit its
  control, and each answered on the first try. Not reproduced.
- CPU ×6 (11-, environment only):
  - When `drawn` returned (it waits only for Invite), the room was still PRE-JOIN: «Join the room / Joining…»,
    «Check audio and video», Chat, People, Brief.
  - After the entrance wait it was live: Microphone, Camera, «Leave the room», and «Audio settings» / «Video settings»
    in place of «Check audio and video».
  - The live dock adds presses before Chat, People and Brief, so their indices shift.
  - A list taken before the join therefore names exactly CI's four controls, then reads other elements by stale index
    and point. In this run the join finished just before the list was taken, so the sweep itself still answered.
- This is a test-state defect: «the room in a call» was measured without the call the URL asks for. That CI's failure
  had this cause is consistent with the witness but NOT proved: CI's DOM and timing were not captured.

## Correction

- That page's drawn parts now also wait for «Leave the room», i.e. the live call.
- Every press, style criterion, threshold and assertion is unchanged, as are the other pages and the shared sweep.

## Evidence

- Full `press-answers.spec.ts` once (30-, 5 workers): 21 passed, 1 failed. «the room in a call» passed.
- The failure is NEW and SEPARATE: «personal» found two `button.ghost «Copy»` that do not answer. That row and the
  sweep are untouched by this change, and CI did not fail there. Cause UNKNOWN. Its trace is kept; it was not rerun.
- oxlint (type-aware) 0; `tsc` for studio 0.
- Not done: reproducing the original CI failure; the 800-test Room2 suite; CI.
