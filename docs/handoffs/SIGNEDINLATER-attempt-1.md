# Implementation-session handoff

Goal and attempt: the sign-in page downloads only what signing in needs (`docs/plans/signed-in-later.md`), attempt 1.
The «$20» pass, load; Luis: «Sigue con lo siguiente de la cola».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a load improvement named in «Goal and attempt».
Writable scope: `apps/studio/src/app/{App.tsx,SignedIn.tsx (new),signed-in-load.ts (new),LoadFailed.tsx (new),opening-prepares.ts (new),useOpening.ts,auth.ts,SignIn.tsx}`, `apps/studio/src/api/{client.ts,timeouts.ts (new)}`, `apps/studio/src/features/work/planning/{review-outcome.ts (new),review-proposal.ts,review-proposal.test.ts,ReviewSources.tsx,fixture-boundary.test.ts}`, `apps/studio/fixtures/{opening.tsx,room.tsx}`, `apps/studio/e2e/signed-in-later.spec.ts` (new), the design note and this handoff.
Runtime unit: the Studio (`apps/studio`): how its code is split and loaded; no API, contract or data change; nothing on screen changes but a new screen when a part can't load.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `perf/signed-in-later` from `main` (`444235d0`), 2026-10-10
Ending commit/tree: `0593b87c94650baa170c9af45a35076c63339692` (tree `3042e2bc6ae2cb166d8927d8ce61c53afc79e770`). The commit after it adds only this handoff.

## Outcome

- The signed-in Studio (Home, the personal space, the projects) is its own chunk, loaded once a session is there, behind
  one Suspense boundary with the opening's last step, so the opening still hands off once Home is mounted.
- The static chains that dragged the API's client and the contract validators into the sign-in are cut without
  changing behaviour: a review's outcome apart from its store, the opening's warming apart from its hook, the calls'
  timeouts in their own module.
- Fetched ahead once the person starts to sign in, with a link offered, or for a member at a room's door; never at rest.
- A part that can't load or draw is said («Sophia couldn't finish opening», «Load again»): the app's first error
  boundary, around the signed-in Studio and the door. A failed fetch is forgotten, so the next asks again.

## Evidence

- Production build, what the sign-in downloads: 104 kB gzip of script (from 335) and 15 kB gzip of style (from 40);
  the signed-in Studio (162 kB gzip) and the validators (81 kB gzip) come once a session is there.
- Under the machine's guard, beside AION2 at low priority (Luis's word, floors untouched), on the final code:
  `signed-in-later` ×2, 6 passed; `signed-in-later`, `app-auth` and `opening`, 28 passed. Unit tests: 1017 passed.
- Mutants with a passing control: the signed-in Studio imported statically, the client imported by the sign-in again,
  a fetch at rest after a short timer, no fetch ahead, no boundary: each fails its check.
- Prettier, `oxlint --type-aware` on the whole repo, `tsc --noEmit` for the Studio.
- Independent review (committed objects), twice: no P1 or P2 left. Its P2s taken: a failed fetch was kept for good and
  nothing caught it (a deploy between typing and signing in left a blank page): now forgotten, and said with «Load
  again»; the at-rest check read finished resources once: it records each request as it leaves and waits 2 s. Its P3s
  taken: members at the door fetch ahead, listeners catch before any field, the door's boundary, words that cover a
  part failing to draw, tidier imports, stale comments, the note.

## Limitations and next action

- A failed fetch ahead, then a sign-in on the same page, has no check: these fixture pages can't sign in there.
- The opening covers the chunk's fetch within its 5 s: on a slow connection, after a link opened in another tab or a
  provider's return, it may hand off to «Sophia» while the chunk arrives. The first render of the boundary commits its
  fallback once even with the chunk in cache (hidden while the opening covers).
- The validators themselves (665 kB minified for 35 parsers used) are `@sophia/contracts`' own change (Davide's).
- Next: merge on green CI with no Codex P1.
