# The Auth client's bound covers the reply's body, and an expired token is renewed once before the door closes

> 2026-10-19 · Codex P2 on #470 (`apps/studio/src/app/bounded-fetch.ts`) and the reliability baseline's gap #3, «401
> por token caducado = sesión terminada» (`evaluacion-2026-10-19/fiabilidad/linea-base.md` §1.6, §4 M8, §5); Luis
> 2026-10-19: «quisiera trabajar en la fiabilidad y resiliencia. Ahí tendríamos que también medir. Lo que no se mide, no
> se puede mejorar» and «Arranca R2 en paralelo». Studio only, no API. Two concerns, one test-first pair each.

## What was measured

**Codex's P2 holds.** `boundedFetch` (`app/bounded-fetch.ts`) clears its timer and stops following the caller's signal
in the `finally` of the `fetch` promise, which settles with the reply's headers. supabase-js then reads the body
(`_request` → `response.json()`, and `refresh-refusal.ts` reads a refused refresh's copy first). An Auth service, or a
proxy before it, that sends headers and then stalls leaves that read waiting for good, and the client's own abort,
once the headers are in, no longer reaches the request. The note before this one said the bound «ends the wait for the
reply's headers, not its body … that stays as it is» (`reliability-retry-5xx-and-write-timeouts.md`); the review is
right that it shouldn't.

- Who uses it: the App's Auth client (`auth-fetch.ts`, 30 s) and the checks' client (`reauth.ts`, 20 s). Both are
  supabase-js clients; neither streams. Every Auth reply is a small JSON body or none (a sign-out's 204).

**Gap #3, the hypothesis, checked in its two halves before any code:**

- **The API answers 401 to an expired token.** `createActorVerifier` (`apps/api/src/auth.ts`) verifies with `jose`'s
  `jwtVerify`, which refuses a token past its `exp` (no clock tolerance is set); the error becomes
  `actor_context_required`, 401, `retry: 'reauthorize'` (`packages/domain/src/errors.ts:36`). The API's own test sends
  a token with `exp: '-1m'` and asserts 401 `actor_context_required` (`apps/api/src/api.db.test.ts`, «requires a valid
  authenticated-user token»).
- **supabase-js doesn't always refresh in time.** `@supabase/auth-js` 2.117.1: the refresh ticker runs every 30 s and
  refreshes once the token has under 90 s left (`lib/constants.js`: `AUTO_REFRESH_TICK_DURATION_MS`,
  `EXPIRY_MARGIN_MS`), and only in a shown tab: hidden, the ticker stops (`_onVisibilityChanged`). Shown again, it
  starts the ticker and recovers the session, asynchronously, behind its lock. A laptop that sleeps past the token's
  hour wakes with the old token in the page's state, and the project feed asks for its stream at once on `online` and
  on `visibilitychange` (`pageWakes`, `useProjectFeed.ts`), before supabase-js's refresh has come back.
- What the page does then: the stream's 401 makes the loop ask the snapshot (`refused`, `feed-loop.ts`), which 401s
  with the same token; `blockedBy` maps any 401 to `expired` (`project-door.ts`), the loop ends `denied`, and the
  project shows «You’ve been signed out · Sign in again to continue.» The person is still signed in. When the
  refresh lands, the token changes and the feed starts again, but the snapshot's query keeps its 401 (its key has no
  token, and a closed door isn't asked again, `staleRetry`), so the notice stays until an event or a reload. A read
  that 401s fails as a refusal (`retryRead` doesn't retry `reauthorize`), and a keyed write's 401 is a refusal that
  lets its key go (`held-write.ts`). Nothing anywhere refreshes and asks again.
- **Proven in the browser before the fix** (the four checks below, red at the test commit, the App unchanged): a
  conversation opened after the token expired says «This conversation can’t be read now.» (and the project context
  beside it can't be read either); the feed dropped after it shows «You’ve been signed out»; a message sent after it
  never appears; and no refresh is ever asked (0). The hypothesis holds.

## What changes

- **The bound ends with the body** (`boundedFetch`): the reply is read whole inside the bound and handed on as a new
  `Response` with the same status, status text, headers and bytes; the timer and the caller's signal are let go only
  then. A body that never ends is aborted at the bound, and the caller's abort reaches it until it is read. A status
  that has no body (204, 205, 304) is handed on with none. Buffering is right here and nowhere else: no Auth reply
  streams, and the module's only callers are the two supabase-js clients. Its `url` and `redirected` aren't carried;
  supabase-js reads neither.
- **A 401 renews the token once and the request goes again** (`api/renew.ts`, `apiFetch`): every request to the API
  (`client.ts`, `stream.ts`) goes through it. A 401 to a request with a bearer asks for a new token; given one other
  than the token sent, the same request goes once more with it, its other headers (the Idempotency-Key) and body
  unchanged. A second 401 is the answer, and the door closes as today. A 403 is never renewed. 401 means the API
  refused the token before handling anything, so asking again can't record a write twice; a keyed write goes again
  with its key anyway.
  - The renewal waits within the request's own bound: the caller's or the read's signal ends it, as an abort.
  - Where the token comes from is the App's (`app/token-renewal.ts`, registered by `auth.ts` when Supabase is
    configured): the session's current token if it is already another (the ticker or another request renewed it),
    else `refreshSession()`. One renewal per refused token, shared by every request it refused.
  - **No loop:** a token a renewal brought that the API refuses within a minute isn't renewed again (the API refusing
    a fresh token is another cause, not an expiry), so the feed's restart on the new token ends at the closed door.
    A renewal that fails (Auth down, the refresh refused) gives nothing: the 401 stands and the words are today's. A
    refresh the Auth service refuses still signs out as before (`refresh-refusal.ts`).
  - The fixture pages have no App and register nothing: their 401s and 403s (`shutDoor`) are as before.

## Checks

- Unit, `app/bounded-fetch.test.ts`: a fake fetch whose body never ends is aborted at the bound and not before; the
  caller's abort after the headers ends the read; a whole reply keeps its status, headers and body; a 204 has none.
- Browser, `e2e/app-auth.spec.ts` on the real App (`app.html`, the synthetic Auth), with new levers on the page's
  `appFixture`: `expireToken()` (every token the API has seen is refused with the API's 401 until the page sends
  another), `refuseTokens()` (every token, new ones too), `dropStream()` (the feed's stream ends), `refused` and
  `keys`; the synthetic Auth answers a refresh with a new token when the check says so:
  - a read: a conversation opened after the token expired (the second, not read before) shows its messages;
  - the feed: the stream dropped after the token expired comes back «Up to date», no «signed out»;
  - a keyed write: a message sent after the token expired is sent again with the same Idempotency-Key and appears;
  - no loop: when the API refuses every token, one refresh is asked and the door closes as today; 3 s later the
    stream has asked no more and there is still one refresh.
- Unit for the renewal and the request's second try come with the fix (`api/renew.test.ts`,
  `app/token-renewal.test.ts`).
- Neighbours: `signed-in-later`, `dock-header`, `room`, `project-conversation-writes`.

## Limits

- The snapshot's query still keeps a 401 it got before a renewal that came later by itself (a refused renewal, then
  the ticker's); the door stays closed until an event or a reload, as before. Out of this change.
- No telemetry: how often a renewal happens in production stays unseen (gap #5).
