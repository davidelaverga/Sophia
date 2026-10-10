# The sign-in page downloads only what signing in needs

> 2026-10-10 · Luis: «Sigue con lo siguiente de la cola». The «$20» pass, load: what each page downloads before it can
> be used, measured on the production build. No API change, nothing on screen changes.

## What was measured

- One chunk held the whole Studio, and every page loaded it, the sign-in included: 1,551 kB minified, 335 kB gzip of
  script, and 214 kB (40 kB gzip) of style. Only LiveKit, the PDF viewer, the invite sheet and the join page came later.
- 43% of that chunk (665 kB minified) was the contract validators (`@sophia/contracts`, generated with Ajv), brought
  by the API's client: every `parseX` is built at the module's top, so the bundler keeps them all, and the Studio uses
  35 of the 42. React was 207 kB, the views together under 500 kB.
- Static chains from the entry (`src/main.tsx`, its static imports followed) to the client: `App` → `review-proposal`
  (its store, to forget on sign-out) → the client; `App` → `useOpening` → the warming → the client; `auth`, `SignIn`
  → the client, for a timeout's length alone.

## What changes

- The signed-in Studio is its own chunk (`src/app/SignedIn.tsx`, from `App.tsx`): Home, the personal space, the
  projects. `App` loads it lazily (`signed-in-load.ts`), once a session is there or likely. One Suspense boundary holds it and
  the opening's last step (`opening-prepares.ts`, `Studio`), so the opening still hands off only once Home is mounted;
  its fallback is the same «Sophia» the session's finding-out shows.
- The chains are cut without changing what any module does: a source review's outcome (`review-outcome.ts`) apart
  from its store (`review-proposal.ts`, which reads no API); the opening's warming apart from its hook; the calls'
  timeouts in `api/timeouts.ts`, re-exported by the client.
- Fetched ahead, never at rest: on the sign-in page once the person starts (a key, a press, caught before any field
  keeps it), and with a link offered. While who is in is still found out, when an account's session is likely
  (`sessionLikely`): a sign-in's return (a provider's `?code=`, a link's tokens, read as the page loads, as `auth.ts`
  reads them, since signing in takes them out of the address before any effect runs), or supabase-js's own
  `sb-…-auth-token` kept for an account, not a guest's left from a room's door. The chunk and the session's check go
  together, never one after the other. On a room's door only for a member, whom it hands to the Studio.
- «Likely» is not «sure»: a kept session whose refresh then fails, or a return that fails, ends on the sign-in page
  with the chunk fetched. A kept key from another Supabase project on the same address counts as well (the key is
  matched by its shape, not computed from the project's address).
- Why while finding out: the first CI run of this change failed `app-auth` (a session kept, «Account» not drawn within
  5 s). The check waited on the session, then the chunk, then its first compile on the test server: one after the
  other. A person with a session back, cache emptied or a new deploy, would wait the same way.
- The app's test server (`vite.app.config.ts`) prepares the chunk as it starts (`server.warmup`), as a build's chunk
  is ready on its host: no check waits on its first compile.
- A chunk that doesn't arrive (a deploy replaced it, the connection dropped), or a part that fails to draw, is said,
  never a blank screen: «Sophia couldn't finish opening», with «Load again» (`LoadFailed.tsx`, the app's first error
  boundary, around the signed-in Studio and around a room's door). A failed fetch is forgotten, so the next asks
  again.
- The opening still covers the chunk's fetch, within its own 5 s: on a slow connection, a chunk still on its way
  then, it hands off to «Sophia» while the chunk arrives.
- Production build, what the sign-in downloads: 104 kB gzip of script (from 335) and 15 kB gzip of style (from 40).
  The signed-in Studio (162 kB gzip) and the validators (81 kB gzip) come once a session is there.

## Checks (written first)

- `e2e/signed-in-later.spec.ts`, on the app itself (`app.html`), every request recorded as it leaves: at rest (2 s
  past drawing), the sign-in page has asked for neither the signed-in Studio, the client nor the validators; once the
  person starts typing, the signed-in Studio is fetched; signed in with its chunk refused, the page says so and offers
  to load again; with a session kept (past its time, its refresh held), the chunk is asked for while the page still
  finds out who is in, and so with a sign-in's return (`?code=`, its exchange held). At rest, the page keeps
  supabase-js's keys for a provider's sign-in started and left (`…-auth-token-code-verifier`) and for an account's user
  kept apart (`…-auth-token-user`): neither is a session, and nothing is fetched; nor does a guest's session kept from a room's door, back at the Studio's sign-in.
- `app-auth`, unchanged, passes here: proposals kept and forgotten by account, through the new boundary. `opening` passes
  too, on its own fixture page (which draws Home directly, without the boundary).
- Mutants, with a control that passes: the signed-in Studio imported statically, the client imported by the sign-in
  again, a fetch at rest (after a short timer), no fetch ahead, and no boundary each fail their check. The failed
  fetch forgotten has none: its case is a fetch ahead that fails, then a sign-in on the same page, and these fixture
  pages can't sign in there (no Auth service answers a code). For the fetch while finding out: none at all, one
  always, a session's key never matched, matched unanchored, any key taken for one, a guest's session counted, no
  return read, and the return read from the address once the effect runs (as the first try did) each fail their check.

## Left

- The validators themselves: generated whole, 665 kB minified for 35 parsers used. Generating them with shared
  definitions, or each loaded with its view, is `@sophia/contracts`' own change (Davide's), not this one.
