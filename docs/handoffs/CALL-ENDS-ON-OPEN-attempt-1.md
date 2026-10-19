# Implementation-session handoff

Goal and attempt: CALL-ENDS-ON-OPEN (Luis 2026-10-18: «Que más podemos ir haciendo en lo qe esperamos. Ya que tenemos un cuello de botella»; seam #1 of `evaluacion-2026-10-18/experiencia/costuras.md`), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-1`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-1`, branch `seams/call-ends-on-open` from `origin/main` (`73b6a4077`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the guard, `.claude-guards/safe-run.ps1`, two workers); CI as the
run on record.
Existing authority: Luis 2026-10-18, «Que más podemos ir haciendo en lo qe esperamos. Ya que tenemos un cuello de botella»: local only, no push and no PR until he says.
Ending commit/tree: `1eb28001e763` (tree `3622e1b5dbae`), the last commit of `seams/call-ends-on-open`'s own that changes code, after review round 1 (later commits touch only the plan note and this record). Against `73b6a4077` at that commit, besides the plan note and this record: `e2e/app-auth.spec.ts`, `fixtures/app.tsx`, `src/app/SignedIn.tsx`, `src/app/one-call.ts`, `src/app/one-call.test.ts`, `src/features/personal/notice-view.ts`, `src/features/personal/notice-view.test.ts`, `src/features/studio/ProjectShell.tsx`, `src/features/voice/room-view.ts`, `src/features/voice/room-view.test.ts`. Round 1 began at `87ee36ad8`.

## Outcome

- In a call, opening another project used to say «You left Fixture project.» in the toast. Now that same toast says «Your call in “Fixture project” ended when you opened “Research notes”.» and offers Rejoin, which opens the call's project and joins it. A Leave pressed still says «You left …», with nothing to press.

## Evidence

- Written first: `notice-view.test.ts` has 3 failing at the test commit `f1b4d6b1c`. The key failure gave actual `'You left Pitch deck, Q4.'` where `{ message: 'Your call in “Pitch deck, Q4” ended when you opened “Research notes”.', act: 'Rejoin' }` was expected. The two kept cases fail only on the new `{ message, act }` shape. 4/4 pass at the fix.
- Playwright through the guard. At `f1b4d6b1c`, the Rejoin check fails with «Received string: "You left Fixture project."»; the Leave control and the 7 `signed-in-later` checks pass. At `69f427cdc`, the line and Rejoin pass, but the dock stays at «Joining the room…». At `0d7273006`, 171/171 pass across app-auth, signed-in-later, dock-header, room-dock, room-basics, room-return, call-devices, room-recap, room-so-far, room-passage, room-present, toast-over-sheet and home.
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio` and Prettier on the touched files: clean. Studio unit tests: 1749/1751; the two failures are the Windows path ones (`attention.test.ts`, `browser-imports.test.ts`).
- Captures in the session scratchpad, `seams-call-ends-on-open/`: `toast-1280x800-dark.png` and `toast-390x844-light.png`. Horizontal overflow is 0 at both. The toast is 496 × 44 px at 1280 and 195 × 100 px at 390.

## Decisions and changes

- Brief against code: the report says no fixture mounts SignedIn's toast with a live call. The app's page already does (`app-auth.spec.ts`, Codex P1 on #367). What it lacked was a second project, so the lever is `projects=two` on `fixtures/app.tsx`. Its validators load only when asked: a static import made the sign-in page fetch `validators.js`, and 2 `signed-in-later` checks failed. I folded that fix into my own unpushed test commit and ran it red again on the new sha.
- `callEnded` now returns `{ message, act }`. When `opened` is `null` (a title this page hasn't read), it says «another project». A note from the room comes first.
- `useCall` keeps which project's opening is ending the call (`leaveFor`). After the review, that bookkeeping is `oneCall` (`app/one-call.ts`): the cause belongs to the call that runs, so a later Leave never borrows it.
- A second fix (`useJoinOnOpen`): the join waits a tick after the shell's effects. With strict mode off on the app's page, the check passed at the first fix. With it on, the room's unmount ended the join (see the plan note).

## Post-review, round 1 (independent reviewers: three P2s, all real)

- **Rejoin pressed once already back in that call joined the room again after the next Leave.** If the person went back and joined with the dock's own Join, then pressed Rejoin, the request stayed open while that project was on screen. `useJoinOnOpen` skipped any room not `idle` without taking the request as handled. `3a8a477ef` moves the rule, unchanged, into `askedJoin` (`room-view.ts`). The test commit is `9f460d3b8`; I amended my own test commit once, before any fix, so the token count is checked before the dock. At `9f460d3b8`, `askedJoin` fails 2 of 3: `'failed'` gives `'wait'` where `'join'` was expected, `'joining'` gives `'wait'` where `'answered'` was expected. Through the guard (`pw-logs/call-ends-r1-red-2.txt`), the new browser check fails with «Expected: 2, Received: 3» room tokens: the room joined a third time by itself. The fix is `291ce144a`: a room in the call or joining answers the request; after a failed join, Rejoin joins, as Try again does. At the fix, app-auth and join pass 37/37 (`pw-logs/call-ends-r1-green.txt`).
- **A cause written after the call had ended.** `leaveFor` wrote it whatever the call's state. A render still holding the ended call could write it again after the end had read it. The next Leave in that project would then say «ended when you opened …» with Rejoin. I inferred this from the code and did not observe it. `ce0ef6ef2` moves the bookkeeping, unchanged, into `oneCall` (`app/one-call.ts`, pure). At the test commit `3da26188f`, 2 of 7 cases fail. An opening asked after the end returns `true` where `false` was expected. A call that begins reads the old cause: `opened: 'notes'` where `null` was expected. That test commit is also my own, amended once before the fix to add the case that the cause outlives the call's reports while it ends. The fix is `1eb28001e`: the cause is part of the running call. Each call begins with none, the call's reports carry it, and an opening for a call that no longer runs keeps nothing and leaves nothing.
- **No check for «every end forgets the cause».** `one-call.test.ts` now pins it (7 cases). Five mutants were each killed and the control passed: no guard, the cause carried across a new call, the cause dropped on an update, the call kept after its end, the other call never left. The browser check also presses Rejoin a second time, goes Home and presses Leave in the bar: «You left Fixture project.», with nothing to press. That check passes before and after the fix. At the test commit it passed 3/3 (`pw-logs/call-ends-r2-test.txt`, run at `83ab0a5d4`, the same commit before I amended its unit file; the browser spec is identical). The race it guards against can't be reached in a browser.
- **At the head, through the guard** (`pw-logs/call-ends-round2-green.txt`): 181/181 pass across app-auth, join, signed-in-later, dock-header, room-dock, room-basics, room-return, call-devices, room-recap, room-so-far, room-passage, room-present, toast-over-sheet and home. Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio` and Prettier on the touched files: clean. Studio unit tests: 1759/1761; the two failures are the Windows path ones. Nothing a person sees changed in this round, so there are no new captures.

## Remaining obligations

- At 390 px the toast is 195 px wide, so the line wraps to four lines. `.toast` sits at `left: 50%` and shrinks to the half it has, so its `max-width` is never reached. That is a follow-up of its own.
- Work's «Join the room» on a warmed project took the same stuck «Joining…» path in development. I inferred this from the code and did not observe it.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and `evaluacion-2026-10-18/experiencia/costuras.md` (its intro and seam #1).
