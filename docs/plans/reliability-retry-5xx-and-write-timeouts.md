# A proxy's 502/503/504 on a read is asked again; writes wait as writes, and the sign-in has an end

> 2026-10-19 · the reliability baseline's gaps #2 and #10 (`evaluacion-2026-10-19/fiabilidad/linea-base.md` §5; §1.1,
> §1.3, §1.6); Luis 2026-10-19: «quisiera trabajar en la fiabilidad y resiliencia. Ahí tendríamos que también medir. Lo
> que no se mide, no se puede mejorar» and «Procede con el script de medición y el lote R1». Studio only, no API. Two
> concerns, one test-first pair each.

## What was measured

- **Gap #2 holds as written.** `toError(res, retry = 'never')` (`api/client.ts:69-74`) gives every reply without the
  contract's error body `retry: 'never'`. No caller passes the second argument (a grep: `client.ts` ×9, `stream.ts` ×1).
  The App's cache asks a read again unless it is `never` (`retryRead`, `app/account-cache.ts:16-23`). So a read that
  meets what Render's proxy answers while a deploy or a cold start runs (a 502/503/504 HTML page) fails at once, and
  the person reads «That didn’t go through. Try again.»: the words ask for by hand what the code won't do by itself.
- Only the App's cache reads `retry` (`cacheOf`, `retryRead`); the fixture pages make `new QueryClient()` with
  TanStack's default, three tries whatever `retry` says. The project snapshot already retries any 5xx
  (`useProjectFeed.ts:78`); the event stream reconnects whatever its error says (`feed-loop.ts`, `isAccessError`). So
  the gap is the App's reads: the project list, the personal space, members, goals and the rest through `callApi`.
- Every `toError` site, by method:
  - reads (GET): `getSnapshot`, `getDiscussionPage`, `readJson` (goal targets, members), `getProjectActivity`,
    `followEvents` (`stream.ts`), and `callApi` with `method: 'GET'`;
  - writes: `setGoalTarget` and `changeMemberRole` (PUT), `actInCall` and `muteEveryoneInCall` (POST),
    `postIdempotent` (POST with a key), and `callApi` with any other method or a key.
- **Gap #10 holds as written.** `setGoalTarget` and `changeMemberRole` wait `READ_TIMEOUT_MS` (30 s,
  `client.ts:172,210`), against the rule in `timeouts.ts:4-7` that a write waits 90 s because it may be the call that
  wakes an idle server. The App's Supabase Auth client fetches through `refusals.fetch` with no end (`auth.ts:43,54`);
  only the checks' client has one (`boundedFetch`, 20 s, `reauth.ts:50-67`). A refresh, a sign-in link or a sign-out
  that never answers leaves supabase-js waiting for good.
- One thing the baseline doesn't say: `boundedFetch` ends the wait for the reply's headers, not its body (the timer is
  cleared when `fetch` resolves). Auth's replies are small JSON; that stays as it is.

## What changes

- **A read stopped at a proxy is asked again** (`toError`): its second argument becomes what the call is, `'read'` or
  `'write'`, and every site says it. A read whose 502, 503 or 504 has no contract body gets `retry: 'safe_read'`, so
  `retryRead` asks it again as TanStack does (three more tries, 1 s, 2 s, 4 s). Anything else without a body stays
  `never`: a 4xx doesn't change by asking, a 500 is a fault of ours, and a write never repeats itself. A write's
  failure is unchanged: it waits for the person's press, an admission with the same key.
  - `callApi` passes `'read'` exactly when its own rule already calls the call a safe read (a GET without a key).
  - A reply with the contract keeps the API's own `retry`, as before.
  - The words don't change: «That didn’t go through. Try again.» now shows only after the tries are spent.
- **The two PUTs wait as writes** (`WRITE_TIMEOUT_MS`), as every other write does.
- **The App's Auth client has an end** (`app/bounded-fetch.ts`, `boundedFetch(ms)`): the checks' bounded fetch moves to
  its own module, with the bound as an argument. `reauth.ts` keeps 20 s. The App's client (`auth-fetch.ts`, the
  `refusals` watch, moved out of `auth.ts` so it can be tested without the page) waits 30 s per request, as long as an
  API read: Supabase Auth doesn't sleep like Render, and a refresh that takes longer is lost anyway.
  - A request cut at the bound rejects as an abort. supabase-js treats it as a network failure: the session is kept
    and the refresh is tried again (`refresh-refusal.ts:27`), so nobody is signed out by it
    (`@supabase/auth-js` 2.117.1, `lib/fetch.js`: a fetch that rejects is an `AuthRetryableFetchError`).

## Checks, written first

- **Unit** (`api/client.test.ts`):
  - an HTML 502, 503 and 504 on a GET (`getSnapshot`, `callApi` GET) is `retry: 'safe_read'`, and `retryRead` asks it
    again; the same on a POST (`callApi`, `createProject`) and a PUT (`setGoalTarget`) stays `never` (a write repeats
    only on a press); an HTML 404 on a GET stays `never`.
  - the existing «502 from a proxy» case now expects `safe_read` on the read.
  - `setGoalTarget` and `changeMemberRole` against a server that never answers: still waiting at `READ_TIMEOUT_MS`,
    aborted at `WRITE_TIMEOUT_MS`.
- **Unit** (`app/auth-fetch.test.ts`): the App's Auth fetch against a server that never answers is aborted at its bound
  and not before; a caller's own abort ends it at once.
- **Browser** (`app-auth.spec.ts`, the real App on 5198): the project list (`GET /api/v1/projects`, through the network:
  this page fakes no fetch, unlike the room fixture's `installFixtureApi`) answered twice with
  `route.fulfill({ status: 502, contentType: 'text/html', body: '<html>…' })`, then 200. Work shows the seven projects
  with nothing pressed, no failure notice, three requests asked. Today it shows «Try again» and asks once.
- Specs run: `app-auth`, `signed-in-later`, and the specs of the reads and writes touched: `goal-owner-date`,
  `goal-controls`, `goals-overview`, `goal-overdue`, `member-roles`, `remove-member`, `host-controls`.
