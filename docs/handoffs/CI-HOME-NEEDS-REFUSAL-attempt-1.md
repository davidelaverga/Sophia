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
Ending commit/tree: `38520bea9`, the last commit that changes code; the next one updates only this record and the
plan for the coordinator's follow-up (the two sibling specs). Files changed against `9a6b03a73`:
`e2e/home-needs-refusal.spec.ts`, `e2e/updates-refusal.spec.ts`, `e2e/conversations-removal.spec.ts`, `e2e/frames.ts`,
`docs/plans/ci-home-needs-refusal-flake.md`, and this record.

## Outcome

- **The test was wrong, not the product.** Every failure in the logs is the frame count after a fixed 400 ms wait,
  never a cached need: the line after it (`hits` empty) never failed. On CI's runners Home drew 7 to 10 frames in that
  window, under the `> 10` the test asks for to show it sampled at all.
- **The wait now counts frames, not time** (`sampleAfterRefusal`): after the note, at least the old 400 ms, then
  `expect.poll` until more than ten frames have run since the client saw the refusal. The bound is asserted on
  `postFrames` (frames after the refusal), which is stronger than the old `frames` (which also counted the few before).
  The four variants and the phone case use it.
- **New slow-frames case**: «403, delayed body» with every animation frame the page asks for running late, script
  left free. First with its own lever at about 15 a second (CI's rate); since `e459817d8`, the shared lever's 8.
- **The siblings (coordinator's follow-up):** Updates' refused read (`updates-refusal.spec.ts:148`) and the open
  thread's (`conversations-removal.spec.ts:1289`) go red under slow frames and now take the same wait, from
  `e2e/frames.ts` (`framesAfterRefusal`), each with a slow case. The list's refused read (`:1254`) stays green under
  slow frames and is left as it is (below).

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
- **Siblings, under `slowFramesFromNow` (8 a second):**
  - a probe on the existing tests (`pw-logs/sib-probe-1.txt`; the guard stopped it for memory at 22 of 24): Updates'
    variants failed with 4 or 5 frames, the thread's read with 6 or 7 (6 of 6), the list's read passed 6 of 6;
  - the list's read again with its count printed (`pw-logs/sib-probe-2.txt`): 10 of 10 passed with 16 or 17 frames,
    the refusal about 630 ms before the trace was read;
  - **Updates, written first and failing** (`bfe1c4a8c`, `pw-logs/sib-red-updates.txt`): 5 of 5, `Expected: > 10`,
    received 4, 4, 4, 4, 5. **Fix `70fe3ef80`**: the whole spec `-Repeat 20`, 220/220 (`pw-logs/sib-green-updates-2.txt`,
    one worker through `pw-gentle.ps1`: the guard refused two workers for memory);
  - **Home on the shared helpers** (`e459817d8`): the whole spec `-Repeat 20`, 180/180 (`pw-logs/sib-green-home.txt`);
  - **the thread's read, written first and failing** (`711e976cb`, `pw-logs/sib-red-thread.txt`): 5 of 5, `Expected:
    > 10`, received 6 each time. **Fix `38520bea9`**: every `removal · semantic` test `-Repeat 20` (both modes of the
    list and the thread, and the slow case), 100/100 (`pw-logs/sib-green-conv.txt`).
  - at `38520bea9`, once each, the three specs whole and the other users of `e2e/frames.ts` (`voice-amplitude`,
    `voice-meters`, `orb-result`, `paper-orb`): 97/97 (`pw-logs/sib-green-all.txt`).
- Whole-repo `oxlint --type-aware` (exit 0), `tsc --noEmit -p apps/studio` (exit 0), Prettier on every touched spec and
  `e2e/frames.ts`: clean.

## Decisions and changes

- **The 400 ms stays as a floor**, the poll comes after it: a cached row brought back by later work still has the old
  time to show, and the frame count can no longer be short.
- **The slow case is a separate test, not a lever on the four variants.** Slow frames sample more thinly per
  millisecond; the variants keep the machine's own rate, and one case proves the wait holds at CI's.
- **One lever and one wait for the three specs**, in `e2e/frames.ts`: `slowFramesFromNow` was already there
  (`voice-amplitude.md`), and `framesAfterRefusal(page, counted, frames = 10, floorMs = 400)` joined it. Home's own
  lever (15 a second, which reproduced CI's exact counts) gave way to the shared one (8 a second, slower). Both levers
  delay `requestAnimationFrame` in the page's own world only; Playwright's checks run in their isolated world.
- **Each spec keeps its own floor** (Home and Updates 400 ms, the thread 500 ms) and its own trace; the helper reads the
  count through a callback. The conversations trace gained `postFrames`, counted as the other two count it.

## Remaining obligations

- **The list's refused read (`conversations-removal.spec.ts:1254`) is left on its fixed 500 ms**, as the coordinator
  asked for a spec that stays green under slow frames. It stays green because its window opens before Try again, the
  held reads' release and a trip to another view: about 11 of its 16 or 17 frames come before the refusal, and only
  about 5 after it at 8 a second. So its `frames > 10` passes without saying the frames after the refusal were
  sampled. Moving it to `framesAfterRefusal` on `postFrames` (now in its trace) would make it say so; a candidate.
- The follow-up list's other suggestion, measuring Home's frame rate on main against the orb group with the machine
  free, was not done: CI's rate no longer matters to this test.
- CI is the run on record.

## Next bounded action

- Luis: say whether this joins the next batch. It is pushed only on his word and merges on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository, the follow-up list and CI's
  logs only.
