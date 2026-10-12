# Implementation-session handoff

Goal and attempt: the signed-in Studio is asked for beside the app's own start (`docs/plans/signed-in-early.md`), the
first attempt. A regression of #212 found while Luis's «Fix flaky Done-with-no-reply room task test» (#219) ran CI;
Luis: «Fusiona cuando esté en verde».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a load fix named in «Goal and attempt».
Writable scope: `apps/studio/index.html`, `apps/studio/src/app/{signed-in-load.ts,App.tsx}`, `apps/studio/{vite.fixtures.config.ts,vite.app.config.ts}`, `apps/studio/e2e/signed-in-later.spec.ts`, the design note and this handoff.
Runtime unit: the Studio (`apps/studio`): when its signed-in chunk is asked for; no API, contract or data change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `perf/warm-at-load` from `main` (`0ccc344d`), 2026-10-10
Ending commit/tree: `8444a7d59e4d81c0ade506ea7a28c868931b787b` (tree `6ca82036549e9dacfc3ae651d3c531611422df95`). The commit after it adds only this handoff.

## Outcome

- `index.html` runs `signed-in-load.ts` as its own module script: with an account's session likely it asks for the
  signed-in Studio at once, beside the app's modules (in a build, first in the one entry). The hook no longer warms
  while who is in is found out. The app's fixture page serves the early script; the opening's leaves it out.

## Evidence

- The regression, from CI: `app-auth` tests about 1.7 times as long since #212 (one 4.2 s → 7.0 s); `main` failed
  once (`app-auth:265`), #219 once (`app-auth:252`), both on the first «Account» within 5 s.
- Measured on the app's test page, session kept, CPU slowed four times, 6 loads each, under the machine's guard: time
  to «Account» about 1.8 s before #212 (`a66aa9ec`), 2.4–2.9 s on `main`; warming at module load only (a first try)
  changed nothing (2.5–2.9 s: the chunk still waited for the app's modules); with the early script 1.9–2.0 s, the
  chunk asked for at 40–90 ms instead of about 700 ms.
- Written first and seen failing: `signed-in-later`, «the signed-in Studio is asked for beside the app's modules»
  (App.tsx held: the chunk wasn't asked for). On the final code: `signed-in-later`, `app-auth`, `opening`, 32 passed.
- Mutants with a passing control: no early warm (3 checks fail), an early warm whatever is kept (2 fail).
- A production build: one entry, the sign-in's script 102.7 kB gzip, the signed-in chunk (161.6 kB gzip) apart.
- Prettier, `pnpm run lint` (whole repo), `tsc --noEmit` for the Studio.
- Independent review (committed objects): no P1 or P2. Its P3s taken: the opening's fixture page without the early
  script (its timing checks shouldn't carry the chunk's load); one `/@fs` path on every system; the door and
  build in the comments; the note's sizes; the new check's release in a `finally`, its title shorter.

## Limitations and next action

- About 0.1–0.2 s of the regression stays on the dev server (the chunk's own modules after its first request); in
  production the chunk is one file.
- In dev or keyless mode, a stale `sb-*` key now fetches the chunk once.
- Next: merge on green CI with no Codex P1; then re-run #219's CI.
