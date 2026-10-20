# Implementation-session handoff

Goal and attempt: CI-HOME-NEEDS-REFUSAL (the week's top CI flake, `home-needs-refusal.spec.ts:111`; the follow-up
list's «home-needs-refusal frames>10», `evaluacion-2026-10-16/seguimientos-p2.md`; written by Davide's lane; Luis
2026-10-20: «Procede con el próximo lote y arregla tú los de Davide», and «Lo que no se mide, no se puede mejorar»),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-1`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-1`, branch `ci/home-needs-refusal-flake` from
`origin/main` `9a6b03a73` (R1 #470, R2 #472 and group 6 #471 merged; not pushed)
Writable scope: this worktree only (`apps/studio/e2e`, `docs/plans`, `docs/handoffs`); no product code, no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard); CI as the run on record.
Existing authority: Luis, the quotes above; local only, nothing pushed.
Ending commit/tree: `51c41b311`, the last commit that changes code; the next one adds only this record and the plan's
measured lever. Files changed against `9a6b03a73`: `e2e/home-needs-refusal.spec.ts`,
`docs/plans/ci-home-needs-refusal-flake.md`, and this record.

## Outcome

- **The test was wrong, not the product.** Every failure in the logs is the frame count after a fixed 400 ms wait,
  never a cached need: the line after it (`hits` empty) never failed. On CI's runners Home drew 7 to 10 frames in that
  window, under the `> 10` the test asks for to show it sampled at all.
- **The wait now counts frames, not time** (`sampleAfterRefusal`): after the note, at least the old 400 ms, then
  `expect.poll` until more than ten frames have run since the client saw the refusal. The bound is asserted on
  `postFrames` (frames after the refusal), which is stronger than the old `frames` (which also counted the few before).
  The four variants and the phone case use it.
- **New slow-frames case**: «403, delayed body» with every animation frame the page asks for running 50 ms late
  (`slowFrames`), script left free: about 15 frames a second, CI's rate, on every run.

## Evidence

- **CI logs** (`gh api repos/davidelaverga/Sophia/actions/jobs/<job>/logs`, every failed job of the last 20 failed
  `ci.yml` runs): `expect(trace.frames).toBeGreaterThan(10)` received 8 (#472, run 39339435160, job 118357546767,
  «403, delayed body»), 9 (run 39289191121, «401, malformed»), 7 (run 39166721258, «401, malformed»), 7 (run
  39158535555, «401, malformed»); the follow-up list's #462 entry (run 39167111207) received 10. No other spec failed
  more than twice in the same logs.
- **Not reproduced by CPU here:** Home drew 36 to 39 frames in 600 ms at a CDP CPU throttle of 1×, 4×, 6× and 10×
  (a scratch probe, `pw-logs/hnr-probe-1.txt`). A frame that busies the main thread (60 ms, then 110 ms) did not
  reproduce it either: it also holds the test's reads, so the window stretched with the frames (13 or 14 counted;
  `pw-logs/hnr-red-1.txt` to `hnr-red-4.txt`).
- **Reproduced with late frames:** frames 100 ms late gave 4 or 5 (`pw-logs/hnr-red-5.txt`); 50 ms late gave 7 or 8,
  CI's numbers. The refusal's note showed about 20 ms after the refusal reached the app, with the delayed body too.
- **Written first and failing** (`cc3ddba6e`, `pw-logs/hnr-red-6.txt`, 5 repeats): 5 of 5 failed at
  `expect(trace.frames).toBeGreaterThan(10)`, `Expected: > 10`, received 8, 8, 7, 7, 7.
- **Fix `51c41b311`.** Green through the guard:
  - the whole spec with `-Repeat 20`: 180/180, the slow case included (`pw-logs/hnr-green-1.txt`);
  - `home-needs-refusal`, `home-needs`, `home-phone-needs`, `home-since`, `home`, `updates-refusal`: 74/74
    (`pw-logs/hnr-green-2.txt`).
- Whole-repo `oxlint --type-aware` (exit 0), `tsc --noEmit -p apps/studio` (exit 0), Prettier on the spec: clean.

## Decisions and changes

- **The 400 ms stays as a floor**, the poll comes after it: a cached row brought back by later work still has the old
  time to show, and the frame count can no longer be short.
- **The slow case is a separate test, not a lever on the four variants.** Slow frames sample more thinly per
  millisecond; the variants keep the machine's own rate, and one case proves the wait holds at CI's.
- **`slowFrames` delays `requestAnimationFrame` in the page's own world** (with a matching `cancelAnimationFrame`),
  from just before the refusal. Playwright's own checks run in their isolated world and are not slowed.

## Remaining obligations

- `updates-refusal.spec.ts:148` and `conversations-removal.spec.ts:1254`/`:1289` count frames in the same fixed window.
  They did not fail in these logs (their pages draw no light); the same wait would fit them. Not changed here (one
  concern).
- The follow-up list's other suggestion, measuring Home's frame rate on main against the orb group with the machine
  free, was not done: CI's rate no longer matters to this test.
- CI is the run on record.

## Next bounded action

- Luis: say whether this joins the next batch. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository, the follow-up list and CI's
  logs only.
