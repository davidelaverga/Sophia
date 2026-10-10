# The signed-in Studio is asked for beside the app's own start

> 2026-10-10 · Found while Luis's «Fix flaky Done-with-no-reply room task test» ran CI: a regression of #212
> (`docs/plans/signed-in-later.md`), which made the signed-in Studio its own chunk. No API change.

## What was found

- Since #212, the app's checks (`app-auth`) take about 1.7 times as long in CI (one of them, 4.2 s before, 7.0 s
  after), close to the 5 s their first «Account» waits: `main` failed once on it (`app-auth:265`, after #216), and
  #219's run on it (`app-auth:252`).
- Measured on the app's test page with a session kept, the CPU slowed four times as CI's runner: «Account» shows in
  about 1.8 s before #212 and about 2.6 s on `main`. The chunk is asked for at about 0.7 s: only once the app's own
  modules are all in and run (the warm while who is in is found out, `useSignedInAhead`), so its modules come after
  them, one round after another, instead of beside them.
- In production the same order holds for anyone back with a session: the app's script (about 100 kB gzip) is fetched
  and all of it run, React's first render included, before the signed-in Studio's (162 kB) is asked for.

## What changes

- `index.html` loads `src/app/signed-in-load.ts` as its own small module script, before the app's. When an account's
  session is likely (`sessionLikely`: a session kept for an account, not a guest's; a sign-in's return), it asks for
  the signed-in Studio as it runs, beside the app's own modules, never after them. The app imports the same module
  (one instance, one fetch: `loadSignedIn`), so its later asks find the chunk on its way.
- `useSignedInAhead` no longer warms while who is in is found out: the early script has.
- The fixture servers (`studioPageAs`) serve that script from the Studio's own path on the app's page (their root is
  `fixtures/`), and leave it out of the opening's, which draws Home without App.
- With nobody likely in, the early script asks for nothing: the sign-in page at rest still asks for none of the
  signed-in Studio, its client or the validators (`signed-in-later`).
- In a production build Vite joins a page's module scripts into one entry, the early one first: it runs as the
  bundle starts to run, before the app's own modules do, so the chunk is asked for as soon as the app's script has
  arrived. What the sign-in downloads doesn't grow: 102.7 kB gzip of script on this build (#212 measured 104 kB on
  its own). In the dev server (and the app's fixture page) they stay two scripts, fetched side by side.

## Checks (written first)

- `signed-in-later`, new: with a session kept and the app's own `App.tsx` held, the signed-in Studio is already asked
  for (it failed first: the chunk waited for App). The earlier checks pass unchanged (at rest nothing; a guest's
  session nothing; a sign-in's return and a kept session, the chunk while found out).
- `app-auth`, `opening` pass.
- The probe (time to «Account», CPU slowed four times): see the handoff.
- A production build: one entry, the sign-in's script 102.7 kB gzip, the signed-in chunk apart.
- Mutants, with a control that passes: no early warm, and an early warm whatever is kept, each fail a check.
