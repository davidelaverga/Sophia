# Handoff: the background seen-retry case was already fixed on main; the fix is proved, nothing else changes

Goal and attempt: CI-MENTIONS-BACKGROUND-FLAKE (the reliability report of 2026-10-26, `ci-2026-10-26/reliability.md`:
`[desktop] › e2e/mentions.spec.ts:1129:1 › mentions · a failed seen write whose retry falls due in the background waits,
and goes once back in front (r4314628605)`, 1 failure, 2026-10-25 13:07 UTC; one of the batch of three flakes),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-3`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-3`, branch `ci/mentions-background-flake` from
`origin/main` `624441362` (everything through #485 merged); not pushed
Writable scope: this worktree only (`apps/studio/e2e`, `docs/plans`, `docs/handoffs`); no product code, no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-26, «Procede con el lote de los tres flakes»; earlier «arregla tú los de Davide» and
«Lo que no se mide, no se puede mejorar».
Ending commit: the branch's last commit (documents only). Against `624441362`: `docs/plans/ci-mentions-seen-flakes.md`
(new section, «The background case (2026-10-26)») and this record. No code changes.

## Outcome

- **The failure:** run 40196169238, `63430578b`, part 2 of 3: «Expected: 1 · Received: 2» at
  `mentions.spec.ts:1139:36`, `expect(await seenAttempts(page)).toBe(1)` after the 2.5 s in the background. The
  retry had already been sent.
- **The cause is not #473's.** This case uses the real clock and its 503 answers at once. The test read the count
  with `expect.poll`, whose waits grow to 1000 ms, and then hid the page in a separate call. A write read up to a
  second late puts the hide after the retry's 1 s, so the retry goes while the page is still in front.
- **Already fixed:** Davide's `8cf20dad4` (2026-10-25 14:19 UTC, merged through #482, in this branch's base). The page
  hides itself inside the wrapped fetch as the first write is answered 503, before the page reads it. The retry is
  set, and falls due, with the page hidden at any runner pace. Since then all 8 completed CI runs passed it; the one
  failed run (40320260093) failed in `room-basics.spec.ts:18`.
- **The product is right:** a retry due while hidden waits in `due`, and goes once back in front.
- **Where this differs from the brief:** the brief expected #473's missing wait (the answer read before the clock
  moves). There is no clock here, and the race was the hide sent from the runner. That race was closed before this
  attempt, so no test-first commit pair: nothing in the spec or the product needed to change.

## Evidence

- CI log: `gh run view 40196169238 --repo davidelaverga/Sophia --log-failed`, quoted above (also at 13:49:18Z in the
  job's summary). The runs since come from `gh run list --workflow ci.yml`, from 40202235554 to 40416492082.
- **Red reproduced** with a lever (the runner's next step 1.1 s after the poll, `page.waitForTimeout(1100)`) on
  `8cf20dad4`'s parent spec (throwaway `3c791317b`): 30 of 30 failed, «Expected: 1 · Received: 2» at the same
  assertion (`pw-logs/r3-bg-red-old-lever.txt`).
- **The fix holds under the same lever** (throwaway `9c77c7d28`): 30/30 passed (`pw-logs/r3-bg-green-new-lever.txt`).
- **The case still catches what it guards:** with the seen write's and the retry's `backgrounded()` checks removed
  (throwaway mutant `2c306ecff`), 3 of 3 failed, «Expected: 1 · Received: 2» (`pw-logs/r3-bg-mutant.txt`).
- **Green, the spec as it is:** both background cases `--repeat-each=20`, 40/40 (`pw-logs/r3-bg-green-repeat20.txt`);
  the whole of `mentions.spec.ts` once, 37/37 (`pw-logs/r3-bg-green-spec.txt`, run once Blender closed: the guard had
  refused it while Blender was open).
- Whole-repo `oxlint --type-aware` and `tsc --noEmit -p apps/studio`: clean. Prettier: no non-docs file touched.
- The `pw-logs` folder is the session scratchpad's
  (`C:\Users\zerof\AppData\Local\Temp\claude\D--Descargas-Evaluaci-n-cr-tica-de-Sophia-AI\fddfe996-0961-4f97-824f-c26ed967595d\scratchpad\pw-logs`).

## Decisions and changes

- No new wait and no change to the spec: the hide already happens in the page, and anything more would be redundant.
  The levers and the mutant were run from local throwaway branches, never committed to this branch, and deleted after
  their runs.

## Remaining obligations

- None in this worktree. The reliability report still counts the 10-25 failure; it came before `8cf20dad4`.

## Next bounded action

- Push the documents with the next group PR when Luis says. The reliability report can close the row: a failure from
  before `8cf20dad4`.
- Source IDs consulted: none from the source register. The work read this repository, the CI logs and the reliability
  report.
