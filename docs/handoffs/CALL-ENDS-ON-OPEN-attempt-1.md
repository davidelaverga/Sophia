# Implementation-session handoff

Goal and attempt: CALL-ENDS-ON-OPEN (Luis 2026-10-18: «Que más podemos ir haciendo en lo qe esperamos. Ya que tenemos un cuello de botella»; seam #1 of `evaluacion-2026-10-18/experiencia/costuras.md`), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-1`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-1`, branch `seams/call-ends-on-open` from `origin/main` (`73b6a4077`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the guard, `.claude-guards/safe-run.ps1`, two workers); CI as the
run on record.
Existing authority: Luis 2026-10-18, «Que más podemos ir haciendo en lo qe esperamos. Ya que tenemos un cuello de botella»: local only, no push and no PR until he says.
Ending commit/tree: `0d7273006f69` (tree `fbcea3fe0f55`), the last commit of `seams/call-ends-on-open`'s own that changes code (later commits touch only the plan note and this record). 7 files changed against `73b6a4077` at that commit: `e2e/app-auth.spec.ts`, `fixtures/app.tsx`, `src/app/SignedIn.tsx`, `src/features/personal/notice-view.ts`, `src/features/personal/notice-view.test.ts`, `src/features/studio/ProjectShell.tsx`, `docs/plans/call-ends-on-open.md`.

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
- `useCall` keeps which project's opening is ending the call (`leaveFor`, `takeOpened`) and clears it at every end. A later Leave never borrows it.
- A second fix (`useJoinOnOpen`): the join waits a tick after the shell's effects. With strict mode off on the app's page, the check passed at the first fix. With it on, the room's unmount ended the join (see the plan note).

## Remaining obligations

- At 390 px the toast is 195 px wide, so the line wraps to four lines. `.toast` sits at `left: 50%` and shrinks to the half it has, so its `max-width` is never reached. That is a follow-up of its own.
- Work's «Join the room» on a warmed project took the same stuck «Joining…» path in development. I inferred this from the code and did not observe it.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and `evaluacion-2026-10-18/experiencia/costuras.md` (its intro and seam #1).
