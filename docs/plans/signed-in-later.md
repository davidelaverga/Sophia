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
  projects. `App` loads it lazily (`signed-in-load.ts`), once a session is there. One Suspense boundary holds it and
  the opening's last step (`opening-prepares.ts`, `Studio`), so the opening still hands off only once Home is mounted;
  its fallback is the same «Sophia» the session's finding-out shows.
- The chains are cut without changing what any module does: a source review's outcome (`review-outcome.ts`) apart
  from its store (`review-proposal.ts`, which reads no API); the opening's warming apart from its hook; the calls'
  timeouts in `api/timeouts.ts`, re-exported by the client.
- Fetched ahead, never at rest: on the sign-in page once the person starts (a key, a press, caught before any field
  keeps it), and with a link offered. Not while who is in is still found out (nobody may be: a session back has the
  chunk in the browser's cache, its name hashed). On a room's door only for a member, whom it hands to the Studio.
- A chunk that doesn't arrive (a deploy replaced it, the connection dropped) is said, never a blank screen: «Sophia
  couldn't finish opening», with «Load again» (`LoadFailed.tsx`, the app's first error boundary, around the signed-in
  Studio). A failed fetch is forgotten, so the next asks again.
- The opening still covers the chunk's fetch, within its own 5 s: on a path that never fetched ahead (a link opened in
  another tab, a provider's return) on a slow connection, it may hand off to «Sophia» while the chunk arrives.
- Production build, what the sign-in downloads: 103 kB gzip of script (from 335) and 15 kB gzip of style (from 40).
  The signed-in Studio (162 kB gzip) and the validators (81 kB gzip) come once a session is there.

## Checks (written first)

- `e2e/signed-in-later.spec.ts`, on the app itself (`app.html`), every request recorded as it leaves: at rest (2 s
  past drawing), the sign-in page has asked for neither the signed-in Studio, the client nor the validators; once the
  person starts typing, the signed-in Studio is fetched; signed in with its chunk refused, the page says so and offers
  to load again.
- `app-auth`, unchanged, passes: proposals kept and forgotten by account, through the new boundary. `opening` passes
  too, on its own fixture page (which draws Home directly, without the boundary).
- Mutants, with a control that passes: the signed-in Studio imported statically, the client imported by the sign-in
  again, a fetch at rest (after a short timer), no fetch ahead, and no boundary each fail their check. The failed
  fetch forgotten has no check of its own: a page loaded again fetches afresh either way.

## Left

- The validators themselves: generated whole, 665 kB minified for 35 parsers used. Generating them with shared
  definitions, or each loaded with its view, is `@sophia/contracts`' own change (Davide's), not this one.
