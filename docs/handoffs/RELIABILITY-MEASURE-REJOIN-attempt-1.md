# Implementation-session handoff

Goal and attempt: RELIABILITY-MEASURE-REJOIN (the report's own «M5 (call re-join): not in this suite yet», after #475
`reliability/call-rejoin`; lote R3), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `reliability/measure-rejoin` from
`origin/main` `a8a66d260` (#470, #471, #472, #473, #475 merged)
Writable scope: this worktree only (`scripts/`, `tests/unit/`, `apps/studio/e2e/reliability/`, `docs/plans`,
`docs/handoffs`); no Studio, fixture or API code.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` / `measure.ps1` and
`.claude-guards/safe-run.ps1`, two workers).
Existing authority: Luis 2026-10-20, «Procede con el próximo lote»; earlier «Lo que no se mide, no se puede mejorar».
Local only, nothing pushed.
Ending commit/tree: the branch's last commit; code last changed at `124c79f7c`. Against `a8a66d260`:
`scripts/reliability-report.mjs`, `scripts/lib/reliability.mjs`, `tests/unit/reliability-report.test.mjs`,
`apps/studio/e2e/reliability/rejoin.spec.ts` (new), `docs/plans/reliability-measure.md` (section «M5, a dropped call's
way back»), this record.

## Outcome

- **M5 is measured**, no longer «not measurable»: a drop while online back without a press (time to live, tries, «Reconnected.»
  said once), a drop while offline back once online (time from `online` to live, no try while offline), a failed try
  said with Try again and no second try, and the privacy invariant counted: the microphone turned on after a drop
  where the call or this device's choice had it off (violations, per case, beside a control with both on).
- **Honesty kept:** M5 is a fixture metric for the completeness count; a partial run gives «incomplete: n of N» on its
  four rows, no M5 table, and exits 1.

## Evidence

- **Checked against the code first:** `NOT_YET` said «not in this suite yet (linkLost/drop levers exist)»; since #475
  the room's fixture page has `drop()`, `failToken()`, `holdToken`, `holdConnect`, `linkLost`, `mutedByHost`, and
  lists each `room-token` (`served`) and each `connect` / `microphone:on` (`asked`). The BASE-03 checks in
  `room.spec.ts` assert the behaviour and time nothing. No difference from the task's description.
- **Written first** (`19df79d4d`): the file did not load, `SyntaxError: The requested module
  '../../scripts/lib/reliability.mjs' does not provide an export named 'summarizeM5'`; the script's check, run apart
  on a copy without that import, failed on its assertion «the script exits non-zero» (`actual: 0`): an M5 scenario
  listed with no record was not yet counted. Fixed in `373c5fc2e`: 27/27.
- **Scenarios** (`124c79f7c`), first run of the spec alone through the guard (`pw-logs/m5-rejoin-2.txt`): 5 passed,
  every round back, one try each, no violation.
- **The privacy count can see a violation** (control mutant, not committed): with the drop's microphone not carried to
  the try (`room.stand(undefined)` at `useProjectRoom.ts:740`), the try's rounds counted 3 violations of 12, all
  «muted by an admin» (the admin's mute never writes this device's choice, so the try joined by the stored «on»);
  control 3/3 on. Reverted at once (`pw-logs/m5-rejoin-mutant-5.txt`).
- **The whole measuring suite** through `measure.ps1` (`pw-logs/p2-measure-m5-try8.txt`, out
  `scratchpad/measure-p2-m5/`): 39/39 scenarios in 5.2 min, report exit 0, nothing incomplete, «Not measurable yet»
  lists only M9. Tries 1–7 were stopped or refused by the guard for memory (Blender open, WSL at 6.7 GB), never by a
  scenario; the mutant runs 1–4 likewise.

| Metric | Value |
| --- | --- |
| M5 · dropped online → live without a press | 3/3 back · p50 67 ms · p95 173 ms (38, 67, 185) · one try 3/3 · «Reconnected.» said once 3/3 |
| M5 · dropped offline → live once online | 3/3 back · online → live p50 134 ms · p95 198 ms (105, 134, 205) · no try while offline 3/3 · one try 3/3 · said once 3/3 |
| M5 · its one try fails → the dropped words, Try again | 3/3 said with Try again · one try 3/3 · a second try on its own: 0 |
| M5 · microphone back on when off | violations: 0 of 18 rounds (18 back; 6 cases × 3) · control 3/3 back on |

  The rest, for reference: M1 15/15 (overhead p50 23 ms), M2 5/5, M2r 6/6, M6 6 visible / 10 silent, M7 6/6, M3 drop
  p50 1,182 ms, silenced 26.0 s, network back 38 ms, M4 98 ms, M8 read p50 75 ms, write 101 ms, feed 124 ms (met:
  snapshot 3 · stream 0).
- `node --test tests/unit/reliability-report.test.mjs` 27/27; `oxlint --type-aware .` clean; `tsc --noEmit -p
  apps/studio` clean; Prettier clean on every touched file.

## Decisions and changes

- **A new browser context per round:** a call tries once per drop in two minutes, so a second drop in the same page
  would meet the first round's try; separate contexts also keep `call-tabs.ts`'s BroadcastChannel apart.
- **Live** is the dock's Microphone shown again after it went, timed in the page by a MutationObserver from the lever
  (pulled in the page as the clock starts) or from the `online` event. **Tries** are the room tokens asked after the
  drop, read once the round settled («Reconnected.» gone, then a second).
- **A violation counts back in or not:** any `microphone:on` after the drop, or the Microphone shown on once back. The
  control (on in the call and by the choice) must come back on, so a check that can't see a microphone shows up as
  «control 0/3».
- **«No second try»** is watched for 3 s after the failed try; the two-minute rule is the unit checks'.

## Remaining obligations

- The fixture's LiveKit: the time is what the Studio adds after `dropped`, never LiveKit's own ~44 s of tries, nor a
  real token server.
- M9 stays unmeasured (needs a version probe).

## Next bounded action

- Luis: say when to push (with the next group PR); merge on green with no open P1.
- Source IDs consulted: none from the source register; this repository and `docs/plans/call-rejoin.md` only.
